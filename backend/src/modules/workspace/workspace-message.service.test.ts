import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'
const FIRST_MESSAGE_ID = '00000000-0000-4000-8000-000000000003'
const SECOND_MESSAGE_ID = '00000000-0000-4000-8000-000000000004'

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

function message(id: string, content: string, createdAt: string) {
  return {
    id,
    workspace_id: WORKSPACE_ID,
    user_id: USER_ID,
    content,
    created_at: new Date(createdAt),
    user: {
      id: USER_ID,
      name: 'Member',
      profile_image_url: null,
    },
  }
}

test('workspace messages require membership, return history, and publish after create', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, service] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace-message.service'),
  ])

  await t.test('returns the latest messages oldest first', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
      role: 'VIEWER',
    }))
    let query: any
    stubMethod(t, prisma.workspaceMessage, 'findMany', async (args) => {
      query = args
      return [
        message(SECOND_MESSAGE_ID, 'second', '2026-07-29T00:00:02.000Z'),
        message(FIRST_MESSAGE_ID, 'first', '2026-07-29T00:00:01.000Z'),
      ]
    })

    const result = await service.listWorkspaceMessages({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    })

    assert.deepEqual(result.map((item) => item.id), [
      FIRST_MESSAGE_ID,
      SECOND_MESSAGE_ID,
    ])
    assert.equal(query.take, 100)
    assert.deepEqual(query.orderBy, [
      { created_at: 'desc' },
      { id: 'desc' },
    ])
  })

  await t.test('publishes the persisted DTO after creation', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
      role: 'VIEWER',
    }))
    const operationOrder: string[] = []
    stubMethod(t, prisma.workspaceMessage, 'create', async () => {
      operationOrder.push('create')
      return message(FIRST_MESSAGE_ID, 'hello', '2026-07-29T00:00:01.000Z')
    })
    const publications: unknown[][] = []
    stubMethod(t, realtime, 'publish', (...args) => {
      operationOrder.push('publish')
      publications.push(args)
    })

    const result = await service.createWorkspaceMessage({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      content: 'hello',
    })

    assert.equal(result.id, FIRST_MESSAGE_ID)
    assert.deepEqual(operationOrder, ['create', 'publish'])
    assert.equal(publications[0]?.[0], `workspace:${WORKSPACE_ID}`)
    assert.equal(publications[0]?.[1], 'workspace.message_created')
    assert.deepEqual(publications[0]?.[2], result)
  })

  await t.test('rejects a public nonmember before message access', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => null)
    let reads = 0
    stubMethod(t, prisma.workspaceMessage, 'findMany', async () => {
      reads += 1
      return []
    })

    await assert.rejects(
      () =>
        service.listWorkspaceMessages({
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
        }),
      /Forbidden/,
    )
    assert.equal(reads, 0)
  })
})
