// 통합 검색의 공개 범위와 검색 범위, 관련도, 정렬, 페이지네이션 입력을 검증한다.
import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'
const LIST_ID = '00000000-0000-4000-8000-000000000003'
const CARD_ID = '00000000-0000-4000-8000-000000000004'
const PROFILE_ID = '00000000-0000-4000-8000-000000000005'
const LABEL_ID = '00000000-0000-4000-8000-000000000006'
const CREATED_AT = new Date('2026-08-01T00:00:00.000Z')
const UPDATED_AT = new Date('2026-08-02T00:00:00.000Z')

function stubMethod(
  t: TestContext,
  target: object,
  name: string,
  implementation: (...args: any[]) => any,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, name)
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: implementation,
  })
  t.after(() => {
    if (descriptor) Object.defineProperty(target, name, descriptor)
    else Reflect.deleteProperty(target, name)
  })
}

test('unified search merges visible result types before sorting and pagination', async (t) => {
  const [{ prisma }, { search }] = await Promise.all([
    import('../../../src/db'),
    import('../../../src/modules/search/search.service'),
  ])
  let workspaceQuery: any
  let cardQuery: any
  let userQuery: any

  stubMethod(t, prisma.workspace, 'findMany', async (args) => {
    workspaceQuery = args
    return [
      {
        id: WORKSPACE_ID,
        name: 'Product',
        is_public: true,
        created_at: CREATED_AT,
        updated_at: UPDATED_AT,
        members: [
          { user: { name: 'Alice' } },
          { user: { name: 'Bob' } },
          { user: { name: 'Carol' } },
        ],
      },
    ]
  })
  stubMethod(t, prisma.card, 'findMany', async (args) => {
    cardQuery = args
    return [
      {
        id: CARD_ID,
        title: 'Product roadmap',
        description: 'Quarterly plan',
        created_at: CREATED_AT,
        updated_at: UPDATED_AT,
        list: {
          id: LIST_ID,
          name: 'Planning',
          workspace: { id: WORKSPACE_ID, name: 'Product' },
        },
        card_labels: [],
      },
    ]
  })
  stubMethod(t, prisma.user, 'findMany', async (args) => {
    userQuery = args
    return [
      {
        id: PROFILE_ID,
        name: 'Alice',
        profile_image_url: null,
        headline: 'Product developer',
        linkedin_url: null,
        created_at: CREATED_AT,
      },
    ]
  })

  const result = await search({
    userId: USER_ID,
    query: 'product',
    type: 'all',
    sort: 'relevance',
    page: 1,
    limit: 2,
  })

  assert.equal(result.total, 3)
  assert.equal(result.total_pages, 2)
  assert.deepEqual(
    result.items.map((item) => item.kind),
    ['workspace', 'card'],
  )
  assert.equal(result.items[0]?.kind === 'workspace' && result.items[0].member_count, 3)
  assert.equal(result.items[0]?.kind === 'workspace' && result.items[0].name, 'Product')
  assert.ok(workspaceQuery.where.OR)
  assert.ok(cardQuery.where.list.is.workspace.OR)
  assert.deepEqual(userQuery.where.AND, [
    {
      name: { contains: 'product', mode: 'insensitive' },
    },
  ])
})

test('card search applies workspace and active label filters without querying other types', async (t) => {
  const [{ prisma }, { search }] = await Promise.all([
    import('../../../src/db'),
    import('../../../src/modules/search/search.service'),
  ])
  let workspaceCalls = 0
  let userCalls = 0
  let cardQuery: any
  stubMethod(t, prisma.workspace, 'findMany', async () => {
    workspaceCalls += 1
    return []
  })
  stubMethod(t, prisma.user, 'findMany', async () => {
    userCalls += 1
    return []
  })
  stubMethod(t, prisma.card, 'findMany', async (args) => {
    cardQuery = args
    return []
  })

  await search({
    userId: USER_ID,
    query: '',
    type: 'card',
    workspaceId: WORKSPACE_ID,
    labelId: LABEL_ID,
    sort: 'name',
    page: 1,
    limit: 10,
  })

  assert.equal(workspaceCalls, 0)
  assert.equal(userCalls, 0)
  assert.equal(cardQuery.where.list.is.workspace_id, WORKSPACE_ID)
  assert.deepEqual(cardQuery.where.card_labels, {
    some: {
      label_id: LABEL_ID,
      deleted_at: null,
      label: { deleted_at: null, workspace_id: WORKSPACE_ID },
    },
  })
})

test('label-scoped all search returns only cards', async (t) => {
  const [{ prisma }, { search }] = await Promise.all([
    import('../../../src/db'),
    import('../../../src/modules/search/search.service'),
  ])
  let workspaceCalls = 0
  let userCalls = 0
  stubMethod(t, prisma.workspace, 'findMany', async () => {
    workspaceCalls += 1
    return []
  })
  stubMethod(t, prisma.user, 'findMany', async () => {
    userCalls += 1
    return []
  })
  stubMethod(t, prisma.card, 'findMany', async () => [])

  await search({
    userId: USER_ID,
    query: 'product',
    type: 'all',
    workspaceId: WORKSPACE_ID,
    labelId: LABEL_ID,
    sort: 'relevance',
    page: 1,
    limit: 10,
  })

  assert.equal(workspaceCalls, 0)
  assert.equal(userCalls, 0)
})

test('user search matches an exact email without exposing it', async (t) => {
  const [{ prisma }, { search }] = await Promise.all([
    import('../../../src/db'),
    import('../../../src/modules/search/search.service'),
  ])
  let userQuery: any
  stubMethod(t, prisma.user, 'findMany', async (args) => {
    userQuery = args
    return [
      {
        id: PROFILE_ID,
        name: 'Alice',
        profile_image_url: null,
        headline: 'Developer',
        linkedin_url: null,
        created_at: CREATED_AT,
      },
    ]
  })

  const result = await search({
    userId: USER_ID,
    query: ' Person@Example.COM ',
    type: 'user',
    sort: 'name',
    page: 1,
    limit: 10,
  })

  assert.deepEqual(userQuery.where.email, {
    equals: 'person@example.com',
    mode: 'insensitive',
  })
  assert.equal(result.items[0]?.kind, 'user')
  assert.equal(result.items[0]?.kind === 'user' && result.items[0].name, 'Alice')
  assert.equal('email' in (result.items[0] ?? {}), false)
})

test('workspace-scoped user search also enforces workspace visibility', async (t) => {
  const [{ prisma }, { search }] = await Promise.all([
    import('../../../src/db'),
    import('../../../src/modules/search/search.service'),
  ])
  let userQuery: any
  stubMethod(t, prisma.user, 'findMany', async (args) => {
    userQuery = args
    return []
  })

  await search({
    userId: USER_ID,
    query: 'alice',
    type: 'user',
    workspaceId: WORKSPACE_ID,
    sort: 'relevance',
    page: 1,
    limit: 10,
  })

  assert.deepEqual(userQuery.where.memberships.some.workspace.OR, [
    { is_public: true },
    { members: { some: { user_id: USER_ID, deleted_at: null } } },
  ])
})
