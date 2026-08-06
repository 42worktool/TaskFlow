import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const LIST_ID = '00000000-0000-4000-8000-000000000002'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000003'
const CARD_ID = '00000000-0000-4000-8000-000000000004'
const LABEL_ID = '00000000-0000-4000-8000-000000000005'

function setRequiredEnvironment(): void {
  Object.assign(process.env, {
    APP_ORIGIN: 'http://localhost:5173',
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/oauth/callback/google',
    REDIS_URL: 'redis://localhost:6379',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'test',
    SMTP_PASS: 'test',
    SMTP_FROM: 'test@example.com',
  })
}

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

test('deleteList detaches relations and transfers cards to the member inbox', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { deleteList }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./list.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () => ({
    id: LIST_ID,
    workspace_id: WORKSPACE_ID,
  }))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))

  let cardUpdate: unknown
  let labelUpdate: any
  const operationOrder: string[] = []
  stubMethod(t, prisma.card, 'updateMany', (args) => {
    operationOrder.push('cards')
    cardUpdate = args
    return Promise.resolve({ count: 2 })
  })
  stubMethod(t, prisma.cardLabel, 'updateMany', async (args) => {
    operationOrder.push('labels')
    labelUpdate = args
    return { count: 2 }
  })
  stubMethod(t, prisma.list, 'update', async () => {
    operationOrder.push('list')
    return { id: LIST_ID }
  })
  stubMethod(t, prisma, '$queryRaw', async () => {
    operationOrder.push('lock')
    return [{ id: LIST_ID }]
  })
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  let publication: unknown[]
  stubMethod(t, realtime, 'publish', (...args) => {
    operationOrder.push('publish')
    publication = args
  })

  await deleteList({ userId: USER_ID, listId: LIST_ID })

  assert.deepEqual(operationOrder, ['list', 'lock', 'labels', 'cards', 'publish'])
  assert.equal(publication![0], `workspace:${WORKSPACE_ID}`)
  assert.equal(publication![1], 'workspace.changed')
  const event = publication![2] as {
    workspace_id: string
    entity: string
    action: string
    entity_id: string
    list_ids: string[]
    actor_user_id: string
  }
  assert.deepEqual(
    {
      workspace_id: event.workspace_id,
      entity: event.entity,
      action: event.action,
      entity_id: event.entity_id,
      list_ids: event.list_ids,
      actor_user_id: event.actor_user_id,
    },
    {
      workspace_id: WORKSPACE_ID,
      entity: 'list',
      action: 'deleted',
      entity_id: LIST_ID,
      list_ids: [LIST_ID],
      actor_user_id: USER_ID,
    },
  )
  assert.deepEqual(labelUpdate.where, {
    deleted_at: null,
    card: { list_id: LIST_ID, deleted_at: null },
  })
  assert.equal(labelUpdate.data.updated_by, USER_ID)
  assert.equal(labelUpdate.data.deleted_by, USER_ID)
  assert.ok(labelUpdate.data.deleted_at instanceof Date)
  assert.deepEqual(cardUpdate, {
    where: { list_id: LIST_ID, deleted_at: null },
    data: { list_id: null, user_id: USER_ID, updated_by: USER_ID },
  })
})

test('deleteList rejects viewers before creating transaction operations', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { deleteList }] = await Promise.all([
    import('../../db'),
    import('./list.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () => ({
    id: LIST_ID,
    workspace_id: WORKSPACE_ID,
  }))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'VIEWER' }))

  let cardUpdateCalls = 0
  let listUpdateCalls = 0
  stubMethod(t, prisma.card, 'updateMany', async () => {
    cardUpdateCalls += 1
    return { count: 0 }
  })
  stubMethod(t, prisma.list, 'update', async () => {
    listUpdateCalls += 1
    return { id: LIST_ID }
  })

  await assert.rejects(() => deleteList({ userId: USER_ID, listId: LIST_ID }), /Forbidden/)
  assert.equal(cardUpdateCalls, 0)
  assert.equal(listUpdateCalls, 0)
})

test('getList returns one list with cards under the board read policy', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { getList }] = await Promise.all([
    import('../../db'),
    import('./list.service'),
  ])
  const now = new Date('2026-07-29T00:00:00.000Z')
  let listQuery: any
  stubMethod(t, prisma.list, 'findFirst', async (args) => {
    listQuery = args
    return {
      id: LIST_ID,
      workspace_id: WORKSPACE_ID,
      name: 'Todo',
      sequence: 1,
      created_at: now,
      created_by: USER_ID,
      updated_at: now,
      updated_by: USER_ID,
      deleted_at: null,
      deleted_by: null,
      cards: [
        {
          id: CARD_ID,
          list_id: LIST_ID,
          user_id: null,
          title: 'Card',
          description: '',
          start_at: null,
          deadline: null,
          sequence: 1,
          created_at: now,
          created_by: USER_ID,
          updated_at: now,
          updated_by: USER_ID,
          deleted_at: null,
          deleted_by: null,
          card_labels: [
            {
              label_id: LABEL_ID,
              label: { id: LABEL_ID, label_name: 'Bug', label_color: '#ff0000' },
            },
          ],
        },
      ],
    }
  })
  stubMethod(t, prisma.workspace, 'findFirst', async () => ({
    is_public: true,
    members: [],
  }))

  const result = await getList({ userId: USER_ID, listId: LIST_ID })

  assert.equal(result.id, LIST_ID)
  assert.deepEqual(
    result.cards.map((card) => card.id),
    [CARD_ID],
  )
  assert.deepEqual(result.cards[0]?.labels, [
    { label_id: LABEL_ID, label_name: 'Bug', label_color: '#ff0000' },
  ])
  assert.deepEqual(listQuery.include.cards, {
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
  })
})

test('updateList persists and exposes the name', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { updateList }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./list.service'),
  ])
  const now = new Date('2026-07-30T00:00:00.000Z')

  stubMethod(t, prisma.list, 'findFirst', async () => ({
    id: LIST_ID,
    workspace_id: WORKSPACE_ID,
  }))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
    role: 'MEMBER',
  }))
  let updateArgs: any
  stubMethod(t, prisma.list, 'update', async (args) => {
    updateArgs = args
    return {
      id: LIST_ID,
      workspace_id: WORKSPACE_ID,
      name: 'Done',
      sequence: 1,
      created_at: now,
      created_by: USER_ID,
      updated_at: now,
      updated_by: USER_ID,
      deleted_at: null,
      deleted_by: null,
    }
  })
  stubMethod(t, realtime, 'publish', () => undefined)

  const result = await updateList({
    userId: USER_ID,
    listId: LIST_ID,
    name: 'Done',
  })

  assert.deepEqual(updateArgs.data, {
    name: 'Done',
    updated_by: USER_ID,
  })
  assert.equal(result.name, 'Done')
})
