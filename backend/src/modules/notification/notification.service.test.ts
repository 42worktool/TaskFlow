import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const RECIPIENT_ID = '00000000-0000-4000-8000-000000000002'
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

test('member joined notification is sent once per other user', async (t) => {
  setRequiredEnvironment()
  const [{ realtime }, { notifyWorkspaceMemberJoined }] = await Promise.all([
    import('../../realtime'),
    import('./notification.service'),
  ])

  const deliveries: unknown[][] = []
  stubMethod(t, realtime, 'sendToUser', (...args) => {
    deliveries.push(args)
  })

  const notification = notifyWorkspaceMemberJoined({
    recipientUserIds: [RECIPIENT_ID, RECIPIENT_ID, ACTOR_ID],
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Prototype',
    actor: {
      userId: ACTOR_ID,
      name: '초대 사용자',
      profileImageUrl: null,
    },
  })

  assert.equal(notification.kind, 'workspace.member_joined')
  assert.equal(notification.category, 'UPDATE')
  assert.match(notification.id, /^[0-9a-f-]{36}$/)
  assert.deepEqual(deliveries, [
    [RECIPIENT_ID, 'notification.created', notification],
  ])
})
