import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const ONLINE_USER_ID = '00000000-0000-4000-8000-000000000002'
const OFFLINE_USER_ID = '00000000-0000-4000-8000-000000000003'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000004'
const REMOVAL_WORKSPACE_ID = '00000000-0000-4000-8000-000000000005'
const DELETION_WORKSPACE_ID = '00000000-0000-4000-8000-000000000006'

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

test('workspace realtime authorizes subscriptions and returns an online snapshot', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime, RealtimeError }, realtimeModule, presence] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace.realtime'),
    import('../presence/presence.state'),
  ])

  const handlers = new Map<string, (...args: any[]) => any>()
  const removals: string[] = []
  stubMethod(t, realtime, 'register', (event, _schema, handler) => {
    handlers.set(event, handler)
    return () => {
      removals.push(event)
      handlers.delete(event)
    }
  })

  let workspace: { members: Array<{ user_id: string }> } | null = {
    members: [{ user_id: ONLINE_USER_ID }, { user_id: OFFLINE_USER_ID }],
  }
  stubMethod(t, prisma.workspace, 'findFirst', async () => workspace)

  presence.addPresenceConnection(ONLINE_USER_ID, 'online-connection')
  t.after(presence.clearPresence)

  const stop = realtimeModule.startWorkspaceRealtime()
  t.after(stop)
  const joins: string[] = []
  const leaves: string[] = []
  const context = {
    connectionId: 'connection-id',
    userId: USER_ID,
    send: () => undefined,
    join: (channel: string) => joins.push(channel),
    leave: (channel: string) => leaves.push(channel),
    publish: () => undefined,
  }

  const subscribe = handlers.get('workspace.subscribe')
  const unsubscribe = handlers.get('workspace.unsubscribe')
  assert.ok(subscribe)
  assert.ok(unsubscribe)

  assert.deepEqual(await subscribe(context, { workspace_id: WORKSPACE_ID }), {
    workspace_id: WORKSPACE_ID,
    online_user_ids: [ONLINE_USER_ID],
  })
  assert.deepEqual(joins, [`workspace:${WORKSPACE_ID}`])

  workspace = null
  await assert.rejects(
    () => subscribe(context, { workspace_id: WORKSPACE_ID }),
    (error: unknown) =>
      error instanceof RealtimeError && error.code === 'WORKSPACE_ACCESS_REQUIRED',
  )
  assert.equal(joins.length, 1)

  assert.deepEqual(unsubscribe(context, { workspace_id: WORKSPACE_ID }), {
    workspace_id: WORKSPACE_ID,
  })
  assert.deepEqual(leaves, [`workspace:${WORKSPACE_ID}`])

  stop()
  assert.deepEqual(removals.sort(), ['workspace.subscribe', 'workspace.unsubscribe'])
})

test('workspace change validation is bounded and publishing is best effort', async (t) => {
  setRequiredEnvironment()
  const [{ realtime }, realtimeModule] = await Promise.all([
    import('../../realtime'),
    import('./workspace.realtime'),
  ])

  const warnings: unknown[][] = []
  stubMethod(t, console, 'warn', (...args) => warnings.push(args))

  const invalidEvent = realtimeModule.publishWorkspaceChange({
    workspace_id: WORKSPACE_ID,
    entity: 'card',
    action: 'moved',
    entity_id: ONLINE_USER_ID,
    list_ids: [USER_ID, ONLINE_USER_ID, OFFLINE_USER_ID],
    actor_user_id: USER_ID,
  })
  assert.equal(invalidEvent, null)
  warnings.length = 0

  stubMethod(t, realtime, 'publish', () => {
    throw new Error('transport unavailable')
  })

  const event = realtimeModule.publishWorkspaceChange({
    workspace_id: WORKSPACE_ID,
    entity: 'workspace',
    action: 'updated',
    entity_id: WORKSPACE_ID,
    list_ids: [],
    actor_user_id: USER_ID,
  })

  assert.equal(event?.workspace_id, WORKSPACE_ID)
  assert.equal(event?.entity, 'workspace')
  assert.equal(warnings.length, 1)
})

test('a committed member removal prevents an older authorization query from joining', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime, RealtimeError }, realtimeModule, workspaceService] =
    await Promise.all([
      import('../../db'),
      import('../../realtime'),
      import('./workspace.realtime'),
      import('./workspace.service'),
    ])

  const handlers = new Map<string, (...args: any[]) => any>()
  stubMethod(t, realtime, 'register', (event, _schema, handler) => {
    handlers.set(event, handler)
    return () => handlers.delete(event)
  })
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))

  let resolveAuthorization!: (workspace: { id: string }) => void
  const authorization = new Promise<{ id: string }>((resolve) => {
    resolveAuthorization = resolve
  })
  stubMethod(t, prisma.workspace, 'findFirst', async (args) => {
    if ((args as any).select?.id) return authorization
    return {
      id: REMOVAL_WORKSPACE_ID,
      members: [
        { user_id: ONLINE_USER_ID, role: 'ADMIN' },
        { user_id: USER_ID, role: 'MEMBER' },
      ],
    }
  })
  stubMethod(t, prisma.workspaceMember, 'update', async () => ({}))
  stubMethod(t, realtime, 'publish', () => undefined)
  stubMethod(t, realtime, 'leaveUserChannel', () => undefined)

  const stop = realtimeModule.startWorkspaceRealtime()
  t.after(stop)
  const joins: string[] = []
  const subscribe = handlers.get('workspace.subscribe')
  assert.ok(subscribe)

  const subscription = subscribe(
    {
      connectionId: 'removal-race',
      userId: USER_ID,
      send: () => undefined,
      join: (channel: string) => joins.push(channel),
      leave: () => undefined,
      publish: () => undefined,
    },
    { workspace_id: REMOVAL_WORKSPACE_ID },
  )

  await workspaceService.removeMember({
    userId: ONLINE_USER_ID,
    workspaceId: REMOVAL_WORKSPACE_ID,
    targetUserId: USER_ID,
  })
  resolveAuthorization({ id: REMOVAL_WORKSPACE_ID })

  await assert.rejects(
    () => subscription,
    (error: unknown) =>
      error instanceof RealtimeError &&
      error.code === 'WORKSPACE_SUBSCRIPTION_CHANGED' &&
      error.retryable,
  )
  assert.deepEqual(joins, [])
})

test('a committed workspace deletion prevents an older authorization query from joining', async (t) => {
  setRequiredEnvironment()
  const [
    { prisma },
    { realtime, RealtimeError },
    { workspaceInvitationStore },
    realtimeModule,
    workspaceService,
  ] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace-invitation.store'),
    import('./workspace.realtime'),
    import('./workspace.service'),
  ])

  const handlers = new Map<string, (...args: any[]) => any>()
  stubMethod(t, realtime, 'register', (event, _schema, handler) => {
    handlers.set(event, handler)
    return () => handlers.delete(event)
  })
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))

  let resolveAuthorization!: (workspace: { id: string }) => void
  const authorization = new Promise<{ id: string }>((resolve) => {
    resolveAuthorization = resolve
  })
  stubMethod(t, prisma.workspace, 'findFirst', async (args) => {
    if ((args as any).select?.id) return authorization
    return {
      id: DELETION_WORKSPACE_ID,
      members: [
        { user_id: ONLINE_USER_ID, role: 'OWNER' },
        { user_id: USER_ID, role: 'MEMBER' },
      ],
    }
  })
  stubMethod(t, prisma.workspace, 'update', async () => ({}))
  stubMethod(t, workspaceInvitationStore, 'discardWorkspace', async () => undefined)
  stubMethod(t, realtime, 'publish', () => undefined)
  stubMethod(t, realtime, 'clearChannel', () => undefined)

  const stop = realtimeModule.startWorkspaceRealtime()
  t.after(stop)
  const joins: string[] = []
  const subscribe = handlers.get('workspace.subscribe')
  assert.ok(subscribe)

  const subscription = subscribe(
    {
      connectionId: 'deletion-race',
      userId: USER_ID,
      send: () => undefined,
      join: (channel: string) => joins.push(channel),
      leave: () => undefined,
      publish: () => undefined,
    },
    { workspace_id: DELETION_WORKSPACE_ID },
  )

  await workspaceService.deleteWorkspace({
    userId: ONLINE_USER_ID,
    workspaceId: DELETION_WORKSPACE_ID,
  })
  resolveAuthorization({ id: DELETION_WORKSPACE_ID })

  await assert.rejects(
    () => subscription,
    (error: unknown) =>
      error instanceof RealtimeError &&
      error.code === 'WORKSPACE_SUBSCRIPTION_CHANGED' &&
      error.retryable,
  )
  assert.deepEqual(joins, [])
})

test('subscription acknowledgement uses a fresh post-join member snapshot', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, realtimeModule, presence] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace.realtime'),
    import('../presence/presence.state'),
  ])

  const handlers = new Map<string, (...args: any[]) => any>()
  stubMethod(t, realtime, 'register', (event, _schema, handler) => {
    handlers.set(event, handler)
    return () => handlers.delete(event)
  })

  let resolveAuthorization!: (workspace: { id: string }) => void
  const authorization = new Promise<{ id: string }>((resolve) => {
    resolveAuthorization = resolve
  })
  let queryCount = 0
  stubMethod(t, prisma.workspace, 'findFirst', async () => {
    queryCount += 1
    if (queryCount === 1) return authorization
    return {
      members: [{ user_id: USER_ID }, { user_id: ONLINE_USER_ID }],
    }
  })

  presence.addPresenceConnection(ONLINE_USER_ID, 'snapshot-online')
  t.after(presence.clearPresence)

  const stop = realtimeModule.startWorkspaceRealtime()
  t.after(stop)
  const subscribe = handlers.get('workspace.subscribe')
  assert.ok(subscribe)
  const subscription = subscribe(
    {
      connectionId: 'snapshot-race',
      userId: USER_ID,
      send: () => undefined,
      join: () => undefined,
      leave: () => undefined,
      publish: () => undefined,
    },
    { workspace_id: WORKSPACE_ID },
  )

  resolveAuthorization({ id: WORKSPACE_ID })

  assert.deepEqual(await subscription, {
    workspace_id: WORKSPACE_ID,
    online_user_ids: [ONLINE_USER_ID],
  })
  assert.equal(queryCount, 2)
})
