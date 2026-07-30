import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const FRIEND_USER_ID = '00000000-0000-4000-8000-000000000002'
const FIRST_MESSAGE_ID = '00000000-0000-4000-8000-000000000003'
const SECOND_MESSAGE_ID = '00000000-0000-4000-8000-000000000004'

function setRequiredEnvironment(): void {
  Object.assign(process.env, {
    APP_ORIGIN: 'http://localhost:5173',
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI:
      'http://localhost:3000/api/auth/oauth/callback/google',
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

function user(id: string) {
  return {
    id,
    name: id === USER_ID ? 'Alice' : 'Bob',
    profile_image_url:
      id === FRIEND_USER_ID ? 'https://example.com/bob.png' : null,
  }
}

function message(
  id: string,
  senderUserId: string,
  recipientUserId: string,
  content: string,
  createdAt: string,
) {
  return {
    id,
    sender_user_id: senderUserId,
    recipient_user_id: recipientUserId,
    content,
    created_at: new Date(createdAt),
    sender: user(senderUserId),
    recipient: user(recipientUserId),
  }
}

test('direct messages require friendship, return history, and notify both users', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, service] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./direct-message.service'),
  ])

  await t.test('returns the latest 100 messages oldest first', async (t) => {
    let friendshipQuery: any
    stubMethod(t, prisma.friendship, 'findUnique', async (args) => {
      friendshipQuery = args
      return { user_low_id: USER_ID }
    })
    let messageQuery: any
    stubMethod(t, prisma.directMessage, 'findMany', async (args) => {
      messageQuery = args
      return [
        message(
          SECOND_MESSAGE_ID,
          FRIEND_USER_ID,
          USER_ID,
          'second',
          '2026-07-30T00:00:02.000Z',
        ),
        message(
          FIRST_MESSAGE_ID,
          USER_ID,
          FRIEND_USER_ID,
          'first',
          '2026-07-30T00:00:01.000Z',
        ),
      ]
    })

    const result = await service.listDirectMessages({
      userId: USER_ID,
      friendUserId: FRIEND_USER_ID,
    })

    assert.deepEqual(friendshipQuery, {
      where: {
        user_low_id_user_high_id: {
          user_low_id: USER_ID,
          user_high_id: FRIEND_USER_ID,
        },
      },
      select: { user_low_id: true },
    })
    assert.deepEqual(messageQuery.where, {
      OR: [
        {
          sender_user_id: USER_ID,
          recipient_user_id: FRIEND_USER_ID,
        },
        {
          sender_user_id: FRIEND_USER_ID,
          recipient_user_id: USER_ID,
        },
      ],
    })
    assert.deepEqual(messageQuery.orderBy, [
      { created_at: 'desc' },
      { id: 'desc' },
    ])
    assert.equal(messageQuery.take, 100)
    assert.deepEqual(
      result.map((item) => item.id),
      [FIRST_MESSAGE_ID, SECOND_MESSAGE_ID],
    )
    assert.deepEqual(result[0]?.author, {
      user_id: USER_ID,
      name: 'Alice',
      profile_image_url: null,
    })
    assert.deepEqual(result[0]?.recipient, {
      user_id: FRIEND_USER_ID,
      name: 'Bob',
      profile_image_url: 'https://example.com/bob.png',
    })
  })

  await t.test('creates a message then notifies sender and recipient', async (t) => {
    const operationOrder: string[] = []
    stubMethod(t, prisma.friendship, 'findUnique', async () => {
      operationOrder.push('friendship')
      return { user_low_id: USER_ID }
    })
    let create: any
    stubMethod(t, prisma.directMessage, 'create', async (args) => {
      operationOrder.push('create')
      create = args
      return message(
        FIRST_MESSAGE_ID,
        USER_ID,
        FRIEND_USER_ID,
        'hello',
        '2026-07-30T00:00:01.000Z',
      )
    })
    const deliveries: unknown[][] = []
    stubMethod(t, realtime, 'sendToUser', (...args) => {
      operationOrder.push(`send:${args[0]}`)
      deliveries.push(args)
    })

    const result = await service.createDirectMessage({
      userId: USER_ID,
      friendUserId: FRIEND_USER_ID,
      content: 'hello',
    })

    assert.deepEqual(create.data, {
      sender_user_id: USER_ID,
      recipient_user_id: FRIEND_USER_ID,
      content: 'hello',
    })
    assert.deepEqual(operationOrder, [
      'friendship',
      'create',
      `send:${USER_ID}`,
      `send:${FRIEND_USER_ID}`,
    ])
    assert.deepEqual(deliveries, [
      [USER_ID, 'dm.message_created', result],
      [FRIEND_USER_ID, 'dm.message_created', result],
    ])
  })

  await t.test('rejects history and sends when friendship is missing', async (t) => {
    stubMethod(t, prisma.friendship, 'findUnique', async () => null)
    let reads = 0
    let writes = 0
    let deliveries = 0
    stubMethod(t, prisma.directMessage, 'findMany', async () => {
      reads += 1
      return []
    })
    stubMethod(t, prisma.directMessage, 'create', async () => {
      writes += 1
      return message(
        FIRST_MESSAGE_ID,
        USER_ID,
        FRIEND_USER_ID,
        'hello',
        '2026-07-30T00:00:01.000Z',
      )
    })
    stubMethod(t, realtime, 'sendToUser', () => {
      deliveries += 1
    })

    const hasFriendshipError = (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FRIENDSHIP_REQUIRED'

    await assert.rejects(
      () =>
        service.listDirectMessages({
          userId: USER_ID,
          friendUserId: FRIEND_USER_ID,
        }),
      hasFriendshipError,
    )
    await assert.rejects(
      () =>
        service.createDirectMessage({
          userId: USER_ID,
          friendUserId: FRIEND_USER_ID,
          content: 'hello',
        }),
      hasFriendshipError,
    )

    assert.equal(reads, 0)
    assert.equal(writes, 0)
    assert.equal(deliveries, 0)
  })
})
