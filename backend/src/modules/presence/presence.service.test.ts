import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type {
  RealtimeConnectionDisconnectedInfo,
  RealtimeConnectionInfo,
  RealtimeConnectionLifecycleListener,
} from '../../realtime'

const USER_ID = '00000000-0000-4000-8000-000000000010'
const FRIEND_ID = '00000000-0000-4000-8000-000000000011'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000012'

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

function connection(connectionId: string): RealtimeConnectionInfo {
  return {
    connectionId,
    userId: USER_ID,
    authenticatedAt: Date.now(),
    accessTokenExpiresAt: Date.now() + 60_000,
  }
}

function settleAsyncWork(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

test('presence tracks transitions without blocking disconnect or shutdown', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, presence, presenceState] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./presence.service'),
    import('./presence.state'),
  ])

  let authenticated: RealtimeConnectionLifecycleListener<RealtimeConnectionInfo> | undefined
  let disconnected:
    RealtimeConnectionLifecycleListener<RealtimeConnectionDisconnectedInfo> | undefined

  stubMethod(t, realtime, 'onConnectionAuthenticated', (listener) => {
    authenticated = listener
    return () => {
      authenticated = undefined
    }
  })
  stubMethod(t, realtime, 'onConnectionDisconnected', (listener) => {
    disconnected = listener
    return () => {
      disconnected = undefined
    }
  })
  const friendships = [
    {
      user_low_id: USER_ID,
      user_high_id: FRIEND_ID,
    },
  ]
  let delayNextFriendQuery = false
  let resolveDelayedFriendQuery: (() => void) | undefined
  stubMethod(t, prisma.friendship, 'findMany', () => {
    if (!delayNextFriendQuery) return Promise.resolve(friendships)
    delayNextFriendQuery = false
    return new Promise((resolve) => {
      resolveDelayedFriendQuery = () => resolve(friendships)
    })
  })
  stubMethod(t, prisma.workspaceMember, 'findMany', async () => [{ workspace_id: WORKSPACE_ID }])

  const deliveries: unknown[][] = []
  stubMethod(t, realtime, 'sendToUser', (...args) => {
    deliveries.push(args)
  })
  const publications: unknown[][] = []
  stubMethod(t, realtime, 'publish', (...args) => {
    publications.push(args)
  })
  const warnings: string[] = []
  stubMethod(t, console, 'warn', (...args) => {
    warnings.push(args.join(' '))
  })

  const stop = presence.startPresence({ drainTimeoutMs: 20 })
  t.after(stop)

  authenticated?.(connection('connection-1'))
  await settleAsyncWork()
  assert.equal(presenceState.isUserOnline(USER_ID), true)
  assert.deepEqual(deliveries, [
    [FRIEND_ID, 'friend.presence_changed', { user_id: USER_ID, online: true }],
  ])
  assert.deepEqual(publications, [
    [
      `workspace:${WORKSPACE_ID}`,
      'workspace.member_presence_changed',
      {
        workspace_id: WORKSPACE_ID,
        user_id: USER_ID,
        online: true,
      },
    ],
  ])

  authenticated?.(connection('connection-2'))
  disconnected?.({
    ...connection('connection-1'),
    code: 1000,
    reason: 'first tab closed',
  })
  assert.equal(presenceState.isUserOnline(USER_ID), true)
  assert.equal(deliveries.length, 1)
  assert.equal(publications.length, 1)

  disconnected?.({
    ...connection('connection-2'),
    code: 1000,
    reason: 'last tab closed',
  })
  await settleAsyncWork()
  assert.equal(presenceState.isUserOnline(USER_ID), false)
  assert.deepEqual(deliveries[1], [
    FRIEND_ID,
    'friend.presence_changed',
    { user_id: USER_ID, online: false },
  ])
  assert.deepEqual(publications[1], [
    `workspace:${WORKSPACE_ID}`,
    'workspace.member_presence_changed',
    {
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      online: false,
    },
  ])

  delayNextFriendQuery = true
  authenticated?.(connection('short-lived-connection'))
  assert.equal(presenceState.isUserOnline(USER_ID), true)
  disconnected?.({
    ...connection('short-lived-connection'),
    code: 1000,
    reason: 'closed before the online lookup completed',
  })
  assert.equal(presenceState.isUserOnline(USER_ID), false)

  await settleAsyncWork()
  assert.deepEqual(deliveries.at(-1), [
    FRIEND_ID,
    'friend.presence_changed',
    { user_id: USER_ID, online: false },
  ])
  const deliveriesBeforeStaleQuery = deliveries.length
  const publicationsBeforeStaleQuery = publications.length
  resolveDelayedFriendQuery?.()
  await settleAsyncWork()
  assert.equal(deliveries.length, deliveriesBeforeStaleQuery)
  assert.equal(publications.length, publicationsBeforeStaleQuery)

  delayNextFriendQuery = true
  authenticated?.(connection('connection-with-stuck-query'))
  await stop()
  assert.equal(presenceState.isUserOnline(USER_ID), false)
  assert.equal(
    warnings.some((warning) => warning.includes('[presence] notification drain exceeded 20ms')),
    true,
  )
})
