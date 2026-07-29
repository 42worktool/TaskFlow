import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_A = '00000000-0000-4000-8000-000000000001'
const USER_B = '00000000-0000-4000-8000-000000000002'
const USER_C = '00000000-0000-4000-8000-000000000003'
const CREATED_AT = new Date('2026-07-29T00:00:00.000Z')

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
    name: id === USER_A ? 'Alice' : id === USER_B ? 'Bob' : 'Carol',
    profile_image_url:
      id === USER_B ? 'https://example.com/bob.png' : null,
  }
}

function friendship() {
  return {
    user_low_id: USER_A,
    user_high_id: USER_B,
    created_at: CREATED_AT,
    user_low: user(USER_A),
    user_high: user(USER_B),
  }
}

function friendRequest(otherUserId: string, requestedById: string) {
  return {
    user_low_id: USER_A,
    user_high_id: otherUserId,
    requested_by_id: requestedById,
    created_at: CREATED_AT,
    user_low: user(USER_A),
    user_high: user(otherUserId),
  }
}

function stubTransaction(t: TestContext, prisma: object): void {
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
}

test('friend service keeps pending requests separate from friendships', async (t) => {
  const [{ prisma }, friendService] = await Promise.all([
    import('../../db'),
    import('./friend.service'),
  ])

  await t.test('lists accepted friends with current presence', async (t) => {
    let query: unknown
    stubMethod(t, prisma.friendship, 'findMany', async (args) => {
      query = args
      return [friendship()]
    })

    const friends = await friendService.listFriends({ userId: USER_A })

    assert.deepEqual(friends, [
      {
        id: USER_B,
        name: 'Bob',
        profile_image_url: 'https://example.com/bob.png',
        friends_since: CREATED_AT.toISOString(),
        online: false,
      },
    ])
    assert.deepEqual(query, {
      where: {
        OR: [
          { user_low_id: USER_A },
          { user_high_id: USER_A },
        ],
      },
      include: {
        user_low: {
          select: { id: true, name: true, profile_image_url: true },
        },
        user_high: {
          select: { id: true, name: true, profile_image_url: true },
        },
      },
      orderBy: { created_at: 'desc' },
    })
  })

  await t.test('partitions incoming and outgoing pending requests', async (t) => {
    stubMethod(t, prisma.friendRequest, 'findMany', async () => [
      friendRequest(USER_B, USER_B),
      friendRequest(USER_C, USER_A),
    ])

    const requests = await friendService.listFriendRequests({ userId: USER_A })

    assert.deepEqual(requests, {
      incoming: [
        {
          id: USER_B,
          name: 'Bob',
          profile_image_url: 'https://example.com/bob.png',
          requested_at: CREATED_AT.toISOString(),
        },
      ],
      outgoing: [
        {
          id: USER_C,
          name: 'Carol',
          profile_image_url: null,
          requested_at: CREATED_AT.toISOString(),
        },
      ],
    })
  })

  await t.test('creates a pending request instead of a friendship', async (t) => {
    stubTransaction(t, prisma)
    let userQuery: unknown
    stubMethod(t, prisma.user, 'findFirst', async (args) => {
      userQuery = args
      return { id: USER_B }
    })
    stubMethod(t, prisma.friendship, 'findUnique', async () => null)
    let upsert: unknown
    stubMethod(t, prisma.friendRequest, 'upsert', async (args) => {
      upsert = args
      return friendRequest(USER_B, USER_A)
    })

    const request = await friendService.sendFriendRequest({
      userId: USER_A,
      email: ' Bob@Example.COM ',
    })

    assert.equal(request.id, USER_B)
    assert.deepEqual(userQuery, {
      where: {
        email: { equals: 'bob@example.com', mode: 'insensitive' },
        deleted_at: null,
      },
      select: { id: true },
    })
    assert.deepEqual(upsert, {
      where: {
        user_low_id_user_high_id: {
          user_low_id: USER_A,
          user_high_id: USER_B,
        },
      },
      create: {
        user_low_id: USER_A,
        user_high_id: USER_B,
        requested_by_id: USER_A,
      },
      update: {},
      include: {
        user_low: {
          select: { id: true, name: true, profile_image_url: true },
        },
        user_high: {
          select: { id: true, name: true, profile_image_url: true },
        },
      },
    })
  })

  await t.test('rejects a send when the target already requested the caller', async (t) => {
    stubTransaction(t, prisma)
    stubMethod(t, prisma.user, 'findFirst', async () => ({ id: USER_B }))
    stubMethod(t, prisma.friendship, 'findUnique', async () => null)
    stubMethod(t, prisma.friendRequest, 'upsert', async () =>
      friendRequest(USER_B, USER_B),
    )

    await assert.rejects(
      () =>
        friendService.sendFriendRequest({
          userId: USER_A,
          email: 'bob@example.com',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'FRIEND_REQUEST_ALREADY_RECEIVED',
    )
  })

  await t.test('rejects sending a request to an accepted friend', async (t) => {
    stubTransaction(t, prisma)
    stubMethod(t, prisma.user, 'findFirst', async () => ({ id: USER_B }))
    stubMethod(t, prisma.friendship, 'findUnique', async () => ({
      user_low_id: USER_A,
    }))
    let requestWrites = 0
    stubMethod(t, prisma.friendRequest, 'upsert', async () => {
      requestWrites += 1
      return friendRequest(USER_B, USER_A)
    })

    await assert.rejects(
      () =>
        friendService.sendFriendRequest({
          userId: USER_A,
          email: 'bob@example.com',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ALREADY_FRIENDS',
    )
    assert.equal(requestWrites, 0)
  })

  await t.test('does not leave a request when acceptance wins a send race', async (t) => {
    stubTransaction(t, prisma)
    stubMethod(t, prisma.user, 'findFirst', async () => ({ id: USER_B }))
    let friendshipReads = 0
    stubMethod(t, prisma.friendship, 'findUnique', async () => {
      friendshipReads += 1
      return friendshipReads === 1 ? null : { user_low_id: USER_A }
    })
    stubMethod(t, prisma.friendRequest, 'upsert', async () =>
      friendRequest(USER_B, USER_A),
    )
    let cleanup: unknown
    stubMethod(t, prisma.friendRequest, 'deleteMany', async (args) => {
      cleanup = args
      return { count: 1 }
    })

    await assert.rejects(
      () =>
        friendService.sendFriendRequest({
          userId: USER_A,
          email: 'bob@example.com',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ALREADY_FRIENDS',
    )
    assert.deepEqual(cleanup, {
      where: {
        user_low_id: USER_A,
        user_high_id: USER_B,
      },
    })
  })

  await t.test('rejects sending to yourself before writing a request', async (t) => {
    stubMethod(t, prisma.user, 'findFirst', async () => ({ id: USER_A }))
    let transactionCalls = 0
    stubMethod(t, prisma, '$transaction', async () => {
      transactionCalls += 1
    })

    await assert.rejects(
      () =>
        friendService.sendFriendRequest({
          userId: USER_A,
          email: 'alice@example.com',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'CANNOT_FRIEND_SELF',
    )
    assert.equal(transactionCalls, 0)
  })

  await t.test('accepts only an incoming request and creates the friendship', async (t) => {
    stubTransaction(t, prisma)
    let requestDeletion: unknown
    stubMethod(t, prisma.friendRequest, 'deleteMany', async (args) => {
      requestDeletion = args
      return { count: 1 }
    })
    let friendshipUpsert: unknown
    stubMethod(t, prisma.friendship, 'upsert', async (args) => {
      friendshipUpsert = args
      return friendship()
    })

    const accepted = await friendService.acceptFriendRequest({
      userId: USER_A,
      requesterUserId: USER_B,
    })

    assert.equal(accepted.id, USER_B)
    assert.deepEqual(friendshipUpsert, {
      where: {
        user_low_id_user_high_id: {
          user_low_id: USER_A,
          user_high_id: USER_B,
        },
      },
      create: {
        user_low_id: USER_A,
        user_high_id: USER_B,
      },
      update: {},
      include: {
        user_low: {
          select: { id: true, name: true, profile_image_url: true },
        },
        user_high: {
          select: { id: true, name: true, profile_image_url: true },
        },
      },
    })
    assert.deepEqual(requestDeletion, {
      where: {
        user_low_id: USER_A,
        user_high_id: USER_B,
        requested_by_id: USER_B,
      },
    })
  })

  await t.test('does not allow accepting your own outgoing request', async (t) => {
    stubTransaction(t, prisma)
    stubMethod(t, prisma.friendRequest, 'deleteMany', async () => ({
      count: 0,
    }))

    await assert.rejects(
      () =>
        friendService.acceptFriendRequest({
          userId: USER_A,
          requesterUserId: USER_B,
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'FRIEND_REQUEST_NOT_FOUND',
    )
  })

  await t.test('deletes only the pending pair for reject or cancel', async (t) => {
    let deletion: unknown
    stubMethod(t, prisma.friendRequest, 'deleteMany', async (args) => {
      deletion = args
      return { count: 1 }
    })

    await friendService.deleteFriendRequest({
      userId: USER_B,
      otherUserId: USER_A,
    })

    assert.deepEqual(deletion, {
      where: {
        user_low_id: USER_A,
        user_high_id: USER_B,
      },
    })
  })

  await t.test('removes only the accepted canonical pair', async (t) => {
    let deletion: unknown
    stubMethod(t, prisma.friendship, 'deleteMany', async (args) => {
      deletion = args
      return { count: 1 }
    })

    await friendService.removeFriend({
      userId: USER_B,
      friendUserId: USER_A,
    })

    assert.deepEqual(deletion, {
      where: {
        user_low_id: USER_A,
        user_high_id: USER_B,
      },
    })
  })
})
