import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'
const DELETED_USER_ID = '00000000-0000-4000-8000-000000000003'

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

test('dashboard aggregates padded UTC activity, flow, and current list state', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { getWorkspaceDashboard }] = await Promise.all([
    import('../../db'),
    import('./dashboard.service'),
  ])
  const now = new Date('2026-07-30T15:30:00.000Z')
  let activityQuery: any
  let listQuery: any
  let userQuery: any

  stubMethod(t, prisma.workspace, 'findFirst', async () => ({
    is_public: true,
    members: [],
  }))
  stubMethod(t, prisma.activityLog, 'findMany', async (args) => {
    activityQuery = args
    return [
      {
        actor_user_id: USER_ID,
        operation: 'INSERT',
        event_type: 'LIST_CREATED',
        target_type: 'LIST',
        target_id: 'list-1',
        transaction_id: 104n,
        created_at: new Date('2026-07-03T03:00:00.000Z'),
      },
      {
        actor_user_id: null,
        operation: 'UPDATE',
        event_type: 'CARD_REOPENED',
        target_type: 'CARD',
        target_id: 'card-2',
        transaction_id: 103n,
        created_at: new Date('2026-07-02T03:00:00.000Z'),
      },
      {
        actor_user_id: DELETED_USER_ID,
        operation: 'UPDATE',
        event_type: 'CARD_COMPLETED',
        target_type: 'CARD',
        target_id: 'card-1',
        transaction_id: 102n,
        created_at: new Date('2026-07-02T02:00:00.000Z'),
      },
      {
        actor_user_id: USER_ID,
        operation: 'INSERT',
        event_type: 'COMMENT_CREATED',
        target_type: 'COMMENT',
        target_id: 'comment-1',
        transaction_id: 101n,
        created_at: new Date('2026-07-01T01:00:01.000Z'),
      },
      {
        actor_user_id: USER_ID,
        operation: 'INSERT',
        event_type: 'CARD_CREATED',
        target_type: 'CARD',
        target_id: 'card-1',
        transaction_id: 101n,
        created_at: new Date('2026-07-01T01:00:00.000Z'),
      },
    ]
  })
  stubMethod(t, prisma.list, 'findMany', async (args) => {
    listQuery = args
    return [
      {
        id: 'todo-list',
        name: 'Todo',
        is_done: false,
        cards: [
          { is_completed: true },
          { is_completed: false },
        ],
      },
      {
        id: 'done-list',
        name: 'Done',
        is_done: true,
        cards: [
          { is_completed: true },
          { is_completed: true },
          { is_completed: false },
        ],
      },
    ]
  })
  stubMethod(t, prisma.user, 'findMany', async (args) => {
    userQuery = args
    return [
      {
        id: USER_ID,
        name: 'Alice',
        profile_image_url: 'https://example.com/alice.png',
      },
    ]
  })

  const result = await getWorkspaceDashboard({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    periodDays: 30,
    now,
  })

  assert.deepEqual(activityQuery.where, {
    workspace_id: WORKSPACE_ID,
    event_type: { not: 'WORKSPACE_CREATED' },
    created_at: {
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lt: new Date('2026-07-31T00:00:00.000Z'),
    },
  })
  assert.deepEqual(activityQuery.orderBy, { created_at: 'desc' })
  assert.deepEqual(listQuery.where, {
    workspace_id: WORKSPACE_ID,
    deleted_at: null,
    workspace: { deleted_at: null },
  })
  assert.equal(result.generated_at, now.toISOString())
  assert.equal(result.period_days, 30)
  assert.deepEqual(result.summary, {
    current_total: 5,
    current_done: 3,
    current_not_done: 2,
    created_in_period: 1,
    completed_in_period: 1,
    reopened_in_period: 1,
    completion_rate: 60,
    has_cards: true,
    activity_in_period: 4,
  })
  assert.equal(result.daily_activity.length, 30)
  assert.deepEqual(result.daily_activity[0], {
    date: '2026-07-01',
    count: 1,
    log_count: 2,
  })
  assert.deepEqual(
    result.daily_activity.find((day) => day.date === '2026-07-01'),
    {
      date: '2026-07-01',
      count: 1,
      log_count: 2,
    },
  )
  assert.deepEqual(result.daily_activity.at(-1), {
    date: '2026-07-30',
    count: 0,
    log_count: 0,
  })
  assert.equal(result.daily_flow.length, 30)
  assert.deepEqual(result.daily_flow[0], {
    date: '2026-07-01',
    created: 1,
    completed: 0,
    reopened: 0,
  })
  assert.deepEqual(result.daily_flow[1], {
    date: '2026-07-02',
    created: 0,
    completed: 1,
    reopened: 1,
  })
  assert.deepEqual(result.lists, [
    {
      list_id: 'todo-list',
      name: 'Todo',
      is_done: false,
      card_count: 2,
      completed_card_count: 1,
    },
    {
      list_id: 'done-list',
      name: 'Done',
      is_done: true,
      card_count: 3,
      completed_card_count: 2,
    },
  ])
  assert.deepEqual(result.activity_breakdown, [
    { target_type: 'WORKSPACE', count: 0 },
    { target_type: 'MEMBER', count: 0 },
    { target_type: 'LIST', count: 1 },
    { target_type: 'CARD', count: 3 },
    { target_type: 'COMMENT', count: 1 },
  ])
  assert.deepEqual(userQuery, {
    where: {
      id: { in: [USER_ID, DELETED_USER_ID] },
      deleted_at: null,
    },
    select: {
      id: true,
      name: true,
      profile_image_url: true,
    },
  })
  assert.equal(result.recent_activity.length, 5)
  assert.deepEqual(result.recent_activity[0], {
    event_type: 'LIST_CREATED',
    target_type: 'LIST',
    operation: 'INSERT',
    target_id: 'list-1',
    created_at: '2026-07-03T03:00:00.000Z',
    actor: {
      user_id: USER_ID,
      name: 'Alice',
      profile_image_url: 'https://example.com/alice.png',
    },
  })
  assert.equal(result.recent_activity[1].actor, null)
  assert.equal(result.recent_activity[2].actor, null)
  assert.doesNotThrow(() => JSON.stringify(result))
})

test('dashboard allows public reads and rejects private nonmembers before aggregation', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { getWorkspaceDashboard }] = await Promise.all([
    import('../../db'),
    import('./dashboard.service'),
  ])

  stubMethod(t, prisma.workspace, 'findFirst', async () => ({
    is_public: false,
    members: [],
  }))
  let activityCalls = 0
  let listCalls = 0
  stubMethod(t, prisma.activityLog, 'findMany', async () => {
    activityCalls += 1
    return []
  })
  stubMethod(t, prisma.list, 'findMany', async () => {
    listCalls += 1
    return []
  })

  await assert.rejects(
    () =>
      getWorkspaceDashboard({
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        periodDays: 30,
      }),
    /Forbidden/,
  )
  assert.equal(activityCalls, 0)
  assert.equal(listCalls, 0)
})

test('dashboard applies a seven-day window and caps the newest activity feed at 50 rows', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { getWorkspaceDashboard }] = await Promise.all([
    import('../../db'),
    import('./dashboard.service'),
  ])
  const now = new Date('2026-07-30T15:30:00.000Z')

  stubMethod(t, prisma.workspace, 'findFirst', async () => ({
    is_public: true,
    members: [],
  }))
  stubMethod(t, prisma.activityLog, 'findMany', async () =>
    Array.from({ length: 52 }, (_, index) => {
      const descendingIndex = 51 - index
      return {
        actor_user_id: null,
        operation: 'UPDATE',
        event_type: 'CARD_UPDATED',
        target_type: 'CARD',
        target_id: `card-${descendingIndex}`,
        transaction_id: BigInt(descendingIndex + 1),
        created_at: new Date(
          `2026-07-30T00:00:${String(descendingIndex).padStart(2, '0')}.000Z`,
        ),
      }
    }),
  )
  stubMethod(t, prisma.list, 'findMany', async () => [])

  const result = await getWorkspaceDashboard({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    periodDays: 7,
    now,
  })

  assert.equal(result.period_days, 7)
  assert.equal(result.daily_activity.length, 7)
  assert.equal(result.daily_activity[0].date, '2026-07-24')
  assert.equal(result.daily_activity.at(-1)?.date, '2026-07-30')
  assert.equal(result.daily_flow.length, 7)
  assert.equal(result.summary.activity_in_period, 52)
  assert.equal(result.recent_activity.length, 50)
  assert.equal(result.recent_activity[0].target_id, 'card-51')
  assert.equal(result.recent_activity.at(-1)?.target_id, 'card-2')
  assert.equal(result.recent_activity.every((activity) => activity.actor === null), true)
})
