import { prisma } from '../../db'
import { AppError, NotFoundError } from '../../errors'
import { normalizeEmail } from '../../lib/validation'
import {
  friendRequestInclude,
  friendshipInclude,
  toFriendDto,
  toFriendRequestDto,
} from './friend.dto'
import { canonicalFriendPair, otherUserId } from './friend-pair'
import { isUserOnline } from '../presence/presence.state'

class FriendNotFoundError extends NotFoundError {
  constructor() {
    super('friendship not found')
  }
}

class AlreadyFriendsError extends AppError {
  constructor() {
    super('ALREADY_FRIENDS', 409, 'you are already friends')
  }
}

class FriendRequestAlreadyReceivedError extends AppError {
  constructor() {
    super(
      'FRIEND_REQUEST_ALREADY_RECEIVED',
      409,
      'this user has already sent you a friend request',
    )
  }
}

class FriendRequestNotFoundError extends AppError {
  constructor() {
    super('FRIEND_REQUEST_NOT_FOUND', 404, 'friend request not found')
  }
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

  return friendships.map((friendship) => {
    const friendUserId = otherUserId(friendship, input.userId)
    return toFriendDto(
      friendship,
      input.userId,
      isUserOnline(friendUserId),
    )
  })
}

export async function listFriendRequests(input: { userId: string }) {
  const requests = await prisma.friendRequest.findMany({
    where: {
      OR: [
        { user_low_id: input.userId },
        { user_high_id: input.userId },
      ],
    },
    include: friendRequestInclude,
    orderBy: { created_at: 'desc' },
  })

  return {
    incoming: requests
      .filter((request) => request.requested_by_id !== input.userId)
      .map((request) => toFriendRequestDto(request, input.userId)),
    outgoing: requests
      .filter((request) => request.requested_by_id === input.userId)
      .map((request) => toFriendRequestDto(request, input.userId)),
  }
}

export async function sendFriendRequest(input: { userId: string; email: string }) {
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
  const outcome = await prisma.$transaction(async (tx) => {
    const friendship = await tx.friendship.findUnique({
      where: { user_low_id_user_high_id: pair },
      select: { user_low_id: true },
    })
    if (friendship) throw new AlreadyFriendsError()

    const pending = await tx.friendRequest.upsert({
      where: { user_low_id_user_high_id: pair },
      create: {
        ...pair,
        requested_by_id: input.userId,
      },
      update: {},
      include: friendRequestInclude,
    })

    const acceptedDuringRequest = await tx.friendship.findUnique({
      where: { user_low_id_user_high_id: pair },
      select: { user_low_id: true },
    })
    if (acceptedDuringRequest) {
      await tx.friendRequest.deleteMany({ where: pair })
      return { request: null }
    }
    if (pending.requested_by_id !== input.userId) {
      throw new FriendRequestAlreadyReceivedError()
    }
    return { request: pending }
  })

  if (!outcome.request) throw new AlreadyFriendsError()
  return toFriendRequestDto(outcome.request, input.userId)
}

export async function acceptFriendRequest(input: {
  userId: string
  requesterUserId: string
}) {
  const pair = canonicalFriendPair(input.userId, input.requesterUserId)
  const friendship = await prisma.$transaction(async (tx) => {
    const deleted = await tx.friendRequest.deleteMany({
      where: {
        ...pair,
        requested_by_id: input.requesterUserId,
      },
    })
    if (deleted.count === 0) {
      throw new FriendRequestNotFoundError()
    }

    return tx.friendship.upsert({
      where: { user_low_id_user_high_id: pair },
      create: pair,
      update: {},
      include: friendshipInclude,
    })
  })

  return toFriendDto(
    friendship,
    input.userId,
    isUserOnline(input.requesterUserId),
  )
}

export async function deleteFriendRequest(input: {
  userId: string
  otherUserId: string
}): Promise<void> {
  const pair = canonicalFriendPair(input.userId, input.otherUserId)
  const result = await prisma.friendRequest.deleteMany({ where: pair })
  if (result.count === 0) throw new FriendRequestNotFoundError()
}

export async function removeFriend(input: {
  userId: string
  friendUserId: string
}): Promise<void> {
  const pair = canonicalFriendPair(input.userId, input.friendUserId)
  const result = await prisma.friendship.deleteMany({ where: pair })
  if (result.count === 0) throw new FriendNotFoundError()
}
