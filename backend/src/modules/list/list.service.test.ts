import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const LIST_ID = '00000000-0000-4000-8000-000000000002'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000003'

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
  const [{ prisma }, { deleteList }] = await Promise.all([
    import('../../db'),
    import('./list.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () => ({
    id: LIST_ID,
    workspace_id: WORKSPACE_ID,
  }))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))

  let cardUpdate: unknown
  let memberUpdate: any
  let labelUpdate: any
  const operationOrder: string[] = []
  stubMethod(t, prisma.card, 'updateMany', (args) => {
    operationOrder.push('cards')
    cardUpdate = args
    return Promise.resolve({ count: 2 })
  })
  stubMethod(t, prisma.cardMember, 'updateMany', async (args) => {
    operationOrder.push('members')
    memberUpdate = args
    return { count: 2 }
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

  await deleteList({ userId: USER_ID, listId: LIST_ID })

  assert.deepEqual(operationOrder, ['list', 'lock', 'members', 'labels', 'cards'])
  for (const update of [memberUpdate, labelUpdate]) {
    assert.deepEqual(update.where, {
      deleted_at: null,
      card: { list_id: LIST_ID, deleted_at: null },
    })
    assert.equal(update.data.updated_by, USER_ID)
    assert.equal(update.data.deleted_by, USER_ID)
    assert.ok(update.data.deleted_at instanceof Date)
  }
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

  await assert.rejects(
    () => deleteList({ userId: USER_ID, listId: LIST_ID }),
    /Forbidden/,
  )
  assert.equal(cardUpdateCalls, 0)
  assert.equal(listUpdateCalls, 0)
})
