// ============================================================
// list.service.ts — 보드 리스트 CRUD와 순서 관리
//
// 리스트는 워크스페이스 보드에 직접 속한다. 공용 Prisma와 deleted_at 기반 soft delete,
// 공통 워크스페이스 역할 검사를 사용해 다른 도메인과 권한 규칙을 맞춘다.
// ============================================================
import { prisma } from '../../db'
import { NotFoundError } from '../../errors'
import { createdBy, softDeletedBy, updatedBy } from '../../lib/audit'
import { computeSequence } from '../../lib/ordering'
import { requireWorkspaceReadAccess, requireWorkspaceRole } from '../../lib/workspace-permissions'
import { toBoardListDto, toListDto } from './list.dto'
import { publishWorkspaceChange } from '../workspace/workspace.realtime'

async function assertReadAccess(userId: string, workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, deleted_at: null },
    select: {
      is_public: true,
      members: {
        where: { user_id: userId, deleted_at: null },
        select: { user_id: true },
      },
    },
  })
  requireWorkspaceReadAccess(workspace, userId)
}

/**
 * 보드 첫 렌더링에 필요한 리스트, 카드, 레이블을 한 번에 조회한다.
 * 활성 멤버이거나 공개 워크스페이스일 때 읽을 수 있다.
 */
export async function listLists(input: { userId: string; workspaceId: string }) {
  await assertReadAccess(input.userId, input.workspaceId)

  const lists = await prisma.list.findMany({
    where: { workspace_id: input.workspaceId, deleted_at: null },
    orderBy: { sequence: 'asc' },
    include: {
      cards: {
        where: { deleted_at: null },
        orderBy: { sequence: 'asc' },
        include: {
          card_labels: {
            where: {
              deleted_at: null,
              label: { deleted_at: null },
            },
            orderBy: { created_at: 'asc' },
            include: {
              label: {
                select: { id: true, label_name: true, label_color: true },
              },
            },
          },
        },
      },
    },
  })

  return lists.map(toBoardListDto)
}

export async function getList(input: { userId: string; listId: string }) {
  const list = await prisma.list.findFirst({
    where: { id: input.listId, deleted_at: null },
    include: {
      cards: {
        where: { deleted_at: null },
        orderBy: { sequence: 'asc' },
        include: {
          card_labels: {
            where: {
              deleted_at: null,
              label: { deleted_at: null },
            },
            orderBy: { created_at: 'asc' },
            include: {
              label: {
                select: { id: true, label_name: true, label_color: true },
              },
            },
          },
        },
      },
    },
  })
  if (!list) throw new NotFoundError()

  await assertReadAccess(input.userId, list.workspace_id)
  return toBoardListDto(list)
}

/**
 * 보드의 마지막 순번에 리스트를 만든다. MEMBER 이상이 필요하다.
 */
export async function createList(input: { userId: string; workspaceId: string; name: string }) {
  await requireWorkspaceRole(input.workspaceId, input.userId, 'MEMBER')

  const agg = await prisma.list.aggregate({
    where: { workspace_id: input.workspaceId, deleted_at: null },
    _max: { sequence: true },
  })

  const list = await prisma.list.create({
    data: {
      workspace_id: input.workspaceId,
      name: input.name,
      sequence: (agg._max.sequence ?? 0) + 1,
      ...createdBy(input.userId),
    },
  })
  const dto = toListDto(list)
  publishWorkspaceChange({
    workspace_id: input.workspaceId,
    entity: 'list',
    action: 'created',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
  return dto
}

/**
 * 리스트 이름을 수정한다. MEMBER 이상이 필요하다.
 */
export async function updateList(input: { userId: string; listId: string; name: string }) {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  const updated = await prisma.list.update({
    where: { id: input.listId },
    data: {
      name: input.name,
      ...updatedBy(input.userId),
    },
  })
  const dto = toListDto(updated)
  publishWorkspaceChange({
    workspace_id: list.workspace_id,
    entity: 'list',
    action: 'updated',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
  return dto
}

/**
 * 리스트를 soft delete하고 카드 자체는 개인 인박스로 이동해 보존한다.
 * 실제 DELETE가 아니어서 DB의 onDelete: SetNull이 실행되지 않으므로 관계 정리를
 * 트랜잭션에서 직접 구현한다. MEMBER 이상이 필요하다.
 */
export async function deleteList(input: { userId: string; listId: string }): Promise<void> {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  const detachedRelation = softDeletedBy(input.userId)
  await prisma.$transaction(async (tx) => {
    // 리스트를 먼저 비활성화해 카드 스캔이 끝난 뒤 동시 인박스 복구가
    // 이 리스트에 새 카드를 붙이는 경쟁을 막는다.
    await tx.list.update({
      where: { id: input.listId },
      data: softDeletedBy(input.userId),
    })
    await tx.$queryRaw`
      SELECT "id"
      FROM "Cards"
      WHERE "list_id" = ${input.listId}::uuid
        AND "deleted_at" IS NULL
      FOR UPDATE
    `
    await tx.cardLabel.updateMany({
      where: {
        deleted_at: null,
        card: { list_id: input.listId, deleted_at: null },
      },
      data: detachedRelation,
    })
    await tx.card.updateMany({
      where: { list_id: input.listId, deleted_at: null },
      data: {
        list_id: null,
        user_id: input.userId,
        ...updatedBy(input.userId),
      },
    })
  })

  publishWorkspaceChange({
    workspace_id: list.workspace_id,
    entity: 'list',
    action: 'deleted',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
}

/**
 * 앞뒤 이웃 ID로 워크스페이스 안의 리스트 순서를 바꾼다. MEMBER 이상이 필요하다.
 */
export async function reorderList(input: {
  userId: string
  listId: string
  beforeListId?: string | null
  afterListId?: string | null
}) {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  const siblings = await prisma.list.findMany({
    where: { workspace_id: list.workspace_id, deleted_at: null, id: { not: input.listId } },
    orderBy: { sequence: 'asc' },
  })

  const newSequence = computeSequence(siblings, input.beforeListId, input.afterListId)
  const updated = await prisma.list.update({
    where: { id: input.listId },
    data: { sequence: newSequence, ...updatedBy(input.userId) },
  })
  const dto = toListDto(updated)
  publishWorkspaceChange({
    workspace_id: list.workspace_id,
    entity: 'list',
    action: 'moved',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
  return dto
}
