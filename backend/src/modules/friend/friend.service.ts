import { prisma } from '../../db'
import { AppError, NotFoundError } from '../../errors'
import { normalizeEmail } from '../auth/auth.utils'
import { friendshipInclude, toFriendDto } from './friend.dto'

class CannotFriendSelfError extends AppError {
  constructor() {
    super('CANNOT_FRIEND_SELF', 400, 'you cannot add yourself as a friend')
  }
}

class FriendNotFoundError extends NotFoundError {
  constructor() {
    super('friendship not found')
  }
}

export function canonicalFriendPair(
  userId: string,
  friendUserId: string,
): { user_low_id: string; user_high_id: string } {
  if (userId === friendUserId) throw new CannotFriendSelfError()
  return userId < friendUserId
    ? { user_low_id: userId, user_high_id: friendUserId }
    : { user_low_id: friendUserId, user_high_id: userId }
}

export async function listFriends(input: { userId: string }) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { user_low_id: input.userId },
        { user_high_id: input.userId },
      ],
    },
    include: friendshipInclude,
    orderBy: { created_at: 'desc' },
  })

  return friendships.map((friendship) =>
    toFriendDto(friendship, input.userId),
  )
}

export async function addFriend(input: { userId: string; email: string }) {
  const email = normalizeEmail(input.email)
  const target = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      deleted_at: null,
    },
    select: { id: true },
  })
  if (!target) throw new AppError('USER_NOT_FOUND', 404, 'user not found')

  const pair = canonicalFriendPair(input.userId, target.id)
  const friendship = await prisma.friendship.upsert({
    where: {
      user_low_id_user_high_id: pair,
    },
    create: pair,
    update: {},
    include: friendshipInclude,
  })

  return toFriendDto(friendship, input.userId)
}

export async function removeFriend(input: {
  userId: string
  friendUserId: string
}): Promise<void> {
  const pair = canonicalFriendPair(input.userId, input.friendUserId)
  const result = await prisma.friendship.deleteMany({ where: pair })
  if (result.count === 0) throw new FriendNotFoundError()
}
