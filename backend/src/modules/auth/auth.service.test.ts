import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'

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

test('account deletion requires every owned workspace to be transferred or deleted', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { deleteCurrentUser }] = await Promise.all([
    import('../../db'),
    import('./auth.service'),
  ])
  let ownershipQuery: unknown
  let userDeleteCount = 0

  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async (query) => {
    ownershipQuery = query
    return { workspace_id: WORKSPACE_ID }
  })
  stubMethod(t, prisma.user, 'delete', async () => {
    userDeleteCount += 1
    return {}
  })

  await assert.rejects(
    deleteCurrentUser(USER_ID),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'OWNED_WORKSPACES_REMAIN',
  )
  assert.equal(userDeleteCount, 0)
  assert.deepEqual(ownershipQuery, {
    where: {
      user_id: USER_ID,
      role: 'OWNER',
      deleted_at: null,
      workspace: { deleted_at: null },
    },
    select: { workspace_id: true },
  })
})
