import { prisma } from '../../db'
import { normalizedEmailSchema } from '../../lib/validation'

type SearchType = 'all' | 'workspace' | 'card' | 'user'
type SearchSort = 'relevance' | 'newest' | 'name'

interface SearchInput {
  userId: string
  query: string
  type: SearchType
  workspaceId?: string
  labelId?: string
  sort: SearchSort
  page: number
  limit: number
}

interface SearchSortValue {
  key: string
  sortName: string
  sortDate: string
  searchable: string[]
}

interface WorkspaceSearchItem extends SearchSortValue {
  kind: 'workspace'
  id: string
  name: string
  is_public: boolean
  member_count: number
  created_at: string
  updated_at: string
}

interface CardSearchItem extends SearchSortValue {
  kind: 'card'
  id: string
  title: string
  description: string
  created_at: string
  updated_at: string
  list: { id: string; name: string }
  workspace: { id: string; name: string }
  labels: Array<{ label_id: string; label_name: string; label_color: string }>
}

interface UserSearchItem extends SearchSortValue {
  kind: 'user'
  id: string
  name: string
  profile_image_url: string | null
  headline: string
  linkedin_url: string | null
  created_at: string
}

type InternalSearchItem = WorkspaceSearchItem | CardSearchItem | UserSearchItem

// 워크스페이스/카드/사용자를 각자 DB에서 필터링한 뒤 공통 정렬 키로 합친다.
// 서로 다른 모델을 하나의 Slack형 결과 목록으로 보여주기 위한 내부 표현이다.
function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function relevanceScore(item: SearchSortValue, query: string): number {
  // 완전 일치, 접두 일치, 이름 포함, 보조 필드 포함 순으로 단순 가중치를 부여한다.
  const terms = normalized(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 0

  const name = normalized(item.sortName)
  const searchable = normalized(item.searchable.join(' '))
  const normalizedQuery = normalized(query)
  let score = 0

  if (name === normalizedQuery) score += 1_000
  else if (name.startsWith(normalizedQuery)) score += 400

  for (const term of terms) {
    if (name === term) score += 200
    else if (name.startsWith(term)) score += 100
    else if (name.includes(term)) score += 50
    if (searchable.includes(term)) score += 10
  }

  return score
}

function compareItems(
  left: InternalSearchItem,
  right: InternalSearchItem,
  sort: SearchSort,
  query: string,
) {
  if (sort === 'relevance') {
    const scoreDifference = relevanceScore(right, query) - relevanceScore(left, query)
    if (scoreDifference !== 0) return scoreDifference
  }

  if (sort === 'newest' || sort === 'relevance') {
    const dateDifference = Date.parse(right.sortDate) - Date.parse(left.sortDate)
    if (Number.isFinite(dateDifference) && dateDifference !== 0) return dateDifference
  }

  return (
    left.sortName.localeCompare(right.sortName, 'ko', { sensitivity: 'base' }) ||
    left.key.localeCompare(right.key)
  )
}

function publicItem(item: InternalSearchItem) {
  // 정렬 전용 key/searchable 필드는 응답에서 제거해 내부 검색 구현이 API 계약에 새지 않게 한다.
  if (item.kind === 'workspace') {
    return {
      kind: item.kind,
      id: item.id,
      name: item.name,
      is_public: item.is_public,
      member_count: item.member_count,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }
  }
  if (item.kind === 'card') {
    return {
      kind: item.kind,
      id: item.id,
      title: item.title,
      description: item.description,
      created_at: item.created_at,
      updated_at: item.updated_at,
      list: item.list,
      workspace: item.workspace,
      labels: item.labels,
    }
  }
  return {
    kind: item.kind,
    id: item.id,
    name: item.name,
    profile_image_url: item.profile_image_url,
    headline: item.headline,
    linkedin_url: item.linkedin_url,
    created_at: item.created_at,
  }
}

export async function search(input: SearchInput) {
  const query = input.query.trim()
  const terms = query.split(/\s+/).filter(Boolean)
  const parsedEmail = normalizedEmailSchema.safeParse(query)
  const searchesWorkspaces = (input.type === 'all' || input.type === 'workspace') && !input.labelId
  const searchesCards = input.type === 'all' || input.type === 'card'
  const searchesUsers =
    (input.type === 'all' || input.type === 'user') && Boolean(query) && !input.labelId

  // 워크스페이스와 카드는 공개 범위 또는 활성 멤버십 안에서만 찾는다. 사용자 검색은 공개
  // 프로필을 대상으로 하되 workspace scope가 있으면 그 공간의 활성 멤버로 다시 제한한다.
  const workspaceVisibility = [
    { is_public: true },
    { members: { some: { user_id: input.userId, deleted_at: null } } },
  ]

  // 선택된 타입과 scope에 필요한 쿼리만 실행하고, 독립적인 모델 조회는 병렬 처리한다.
  const [workspaces, cards, users] = await Promise.all([
    searchesWorkspaces
      ? prisma.workspace.findMany({
          where: {
            deleted_at: null,
            ...(input.workspaceId ? { id: input.workspaceId } : {}),
            OR: workspaceVisibility,
            ...(terms.length
              ? {
                  AND: terms.map((term) => ({
                    OR: [
                      { name: { contains: term, mode: 'insensitive' as const } },
                      {
                        members: {
                          some: {
                            deleted_at: null,
                            user: {
                              deleted_at: null,
                              name: { contains: term, mode: 'insensitive' as const },
                            },
                          },
                        },
                      },
                    ],
                  })),
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            is_public: true,
            created_at: true,
            updated_at: true,
            members: {
              where: { deleted_at: null },
              select: { user: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
    searchesCards
      ? prisma.card.findMany({
          where: {
            deleted_at: null,
            list: {
              is: {
                deleted_at: null,
                ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
                workspace: { deleted_at: null, OR: workspaceVisibility },
              },
            },
            // 레이블 ID는 워크스페이스 안에서만 의미가 있으므로 두 scope가 함께 있을 때만 적용한다.
            ...(input.labelId && input.workspaceId
              ? {
                  card_labels: {
                    some: {
                      label_id: input.labelId,
                      deleted_at: null,
                      label: { deleted_at: null, workspace_id: input.workspaceId },
                    },
                  },
                }
              : {}),
            ...(terms.length
              ? {
                  AND: terms.map((term) => ({
                    OR: [
                      { title: { contains: term, mode: 'insensitive' as const } },
                      { description: { contains: term, mode: 'insensitive' as const } },
                      { list: { is: { name: { contains: term, mode: 'insensitive' as const } } } },
                      {
                        list: {
                          is: {
                            workspace: {
                              name: { contains: term, mode: 'insensitive' as const },
                            },
                          },
                        },
                      },
                      {
                        card_labels: {
                          some: {
                            deleted_at: null,
                            label: {
                              deleted_at: null,
                              label_name: { contains: term, mode: 'insensitive' as const },
                            },
                          },
                        },
                      },
                    ],
                  })),
                }
              : {}),
          },
          select: {
            id: true,
            title: true,
            description: true,
            created_at: true,
            updated_at: true,
            list: {
              select: {
                id: true,
                name: true,
                workspace: { select: { id: true, name: true } },
              },
            },
            card_labels: {
              where: { deleted_at: null, label: { deleted_at: null } },
              select: {
                label_id: true,
                label: { select: { label_name: true, label_color: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    searchesUsers
      ? prisma.user.findMany({
          where: {
            deleted_at: null,
            ...(input.workspaceId
              ? {
                  memberships: {
                    some: {
                      workspace_id: input.workspaceId,
                      deleted_at: null,
                      workspace: { deleted_at: null, OR: workspaceVisibility },
                    },
                  },
                }
              : {}),
            ...(parsedEmail.success
              ? { email: { equals: parsedEmail.data, mode: 'insensitive' as const } }
              : {
                  AND: terms.map((term) => ({
                    name: { contains: term, mode: 'insensitive' as const },
                  })),
                }),
          },
          select: {
            id: true,
            name: true,
            profile_image_url: true,
            headline: true,
            linkedin_url: true,
            created_at: true,
          },
        })
      : Promise.resolve([]),
  ])

  const items: InternalSearchItem[] = [
    ...workspaces.map((workspace) => ({
      kind: 'workspace' as const,
      key: `workspace:${workspace.id}`,
      id: workspace.id,
      name: workspace.name,
      is_public: workspace.is_public,
      member_count: workspace.members.length,
      created_at: workspace.created_at.toISOString(),
      updated_at: workspace.updated_at.toISOString(),
      sortName: workspace.name,
      sortDate: workspace.updated_at.toISOString(),
      searchable: [workspace.name, ...workspace.members.map((member) => member.user.name)],
    })),
    ...cards.flatMap((card) => {
      if (!card.list) return []
      const labels = card.card_labels.map((cardLabel) => ({
        label_id: cardLabel.label_id,
        label_name: cardLabel.label.label_name,
        label_color: cardLabel.label.label_color,
      }))
      return [
        {
          kind: 'card' as const,
          key: `card:${card.id}`,
          id: card.id,
          title: card.title,
          description: card.description,
          created_at: card.created_at.toISOString(),
          updated_at: card.updated_at.toISOString(),
          sortName: card.title,
          sortDate: card.created_at.toISOString(),
          list: { id: card.list.id, name: card.list.name },
          workspace: card.list.workspace,
          labels,
          searchable: [
            card.title,
            card.description,
            card.list.name,
            card.list.workspace.name,
            ...labels.map((label) => label.label_name),
          ],
        },
      ]
    }),
    ...users.map((user) => ({
      kind: 'user' as const,
      key: `user:${user.id}`,
      id: user.id,
      name: user.name,
      profile_image_url: user.profile_image_url,
      headline: user.headline,
      linkedin_url: user.linkedin_url,
      created_at: user.created_at.toISOString(),
      sortName: user.name,
      sortDate: user.created_at.toISOString(),
      searchable: [user.name],
    })),
  ]

  // 서로 다른 모델의 결과를 합친 뒤 정렬/페이지를 적용해야 전체 결과 기준 순서가 유지된다.
  items.sort((left, right) => compareItems(left, right, input.sort, query))
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / input.limit))
  const start = (input.page - 1) * input.limit

  return {
    items: items.slice(start, start + input.limit).map(publicItem),
    page: input.page,
    limit: input.limit,
    total,
    total_pages: totalPages,
  }
}
