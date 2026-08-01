import { prisma } from '../../db'
import { AppError, NotFoundError } from '../../errors'
import { realtime } from '../../realtime'
import { normalizeEmail } from '../auth/auth.utils'
import {
  friendUserIdEventSchema,
  friendRequestInclude,
  friendshipInclude,
  toFriendDto,
  toFriendRequestDto,
  type FriendRequestWithUsers,
  type FriendshipWithUsers,
} from './friend.dto'
import { isUserOnline } from '../presence/presence.state'

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

function publishFriendRequestCreated(
  recipientUserId: string,
  request: FriendRequestWithUsers,
): void {
  try {
    const dto = toFriendRequestDto(request, recipientUserId)
    realtime.sendToUser(recipientUserId, 'friend.request_created', dto)
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "friend.request_created"',
      error instanceof Error ? error.message : error,
    )
  }
}

function publishFriendRequestAccepted(
  requesterUserId: string,
  acceptorUserId: string,
  friendship: FriendshipWithUsers,
): void {
  try {
    const dto = toFriendDto(
      friendship,
      requesterUserId,
      isUserOnline(acceptorUserId),
    )
    realtime.sendToUser(requesterUserId, 'friend.request_accepted', dto)
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "friend.request_accepted"',
      error instanceof Error ? error.message : error,
    )
  }
}

function publishFriendRequestDeleted(
  recipientUserId: string,
  actorUserId: string,
): void {
  try {
    const event = friendUserIdEventSchema.parse({
      user_id: actorUserId,
    })
    realtime.sendToUser(recipientUserId, 'friend.request_deleted', event)
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "friend.request_deleted"',
      error instanceof Error ? error.message : error,
    )
  }
}

function publishFriendRemoved(recipientUserId: string, actorUserId: string): void {
  try {
    const event = friendUserIdEventSchema.parse({
      user_id: actorUserId,
    })
    realtime.sendToUser(recipientUserId, 'friend.removed', event)
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "friend.removed"',
      error instanceof Error ? error.message : error,
    )
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

  return friendships.map((friendship) => {
    const friendUserId =
      friendship.user_low_id === input.userId
        ? friendship.user_high_id
        : friendship.user_low_id
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
  publishFriendRequestCreated(target.id, outcome.request)
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

  publishFriendRequestAccepted(input.requesterUserId, input.userId, friendship)
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
  publishFriendRequestDeleted(input.otherUserId, input.userId)
}

export async function removeFriend(input: {
  userId: string
  friendUserId: string
}): Promise<void> {
  const pair = canonicalFriendPair(input.userId, input.friendUserId)
  const result = await prisma.friendship.deleteMany({ where: pair })
  if (result.count === 0) throw new FriendNotFoundError()
  publishFriendRemoved(input.friendUserId, input.userId)
}
