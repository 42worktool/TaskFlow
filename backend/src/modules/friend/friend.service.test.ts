import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_A = '00000000-0000-4000-8000-000000000001'
const USER_B = '00000000-0000-4000-8000-000000000002'
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

function friendship() {
  return {
    user_low_id: USER_A,
    user_high_id: USER_B,
    created_at: CREATED_AT,
    user_low: {
      id: USER_A,
      name: 'Alice',
      profile_image_url: null,
    },
    user_high: {
      id: USER_B,
      name: 'Bob',
      profile_image_url: 'https://example.com/bob.png',
    },
  }
}

test('friend service stores and reads one canonical relationship', async (t) => {
  const [{ prisma }, friendService] = await Promise.all([
    import('../../db'),
    import('./friend.service'),
  ])

  await t.test('lists the user on the other side of each row', async (t) => {
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

  await t.test('adds by normalized email using an idempotent upsert', async (t) => {
    let userQuery: unknown
    stubMethod(t, prisma.user, 'findFirst', async (args) => {
      userQuery = args
      return { id: USER_B }
    })
    let upsert: unknown
    stubMethod(t, prisma.friendship, 'upsert', async (args) => {
      upsert = args
      return friendship()
    })

    const friend = await friendService.addFriend({
      userId: USER_A,
      email: ' Bob@Example.COM ',
    })

    assert.equal(friend.id, USER_B)
    assert.equal(friend.online, false)
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

  await t.test('rejects adding the signed-in user', async (t) => {
    stubMethod(t, prisma.user, 'findFirst', async () => ({ id: USER_A }))
    let upsertCalls = 0
    stubMethod(t, prisma.friendship, 'upsert', async () => {
      upsertCalls += 1
      return friendship()
    })

    await assert.rejects(
      () =>
        friendService.addFriend({
          userId: USER_A,
          email: 'alice@example.com',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'CANNOT_FRIEND_SELF',
    )
    assert.equal(upsertCalls, 0)
  })

  await t.test('removes only the current user canonical pair', async (t) => {
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
