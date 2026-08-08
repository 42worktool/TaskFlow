import { prisma } from '../../db'
import { AppError, NotFoundError } from '../../errors'
import { realtime } from '../../realtime'
import { normalizeEmail } from '../../lib/validation'
import {
  friendUserIdEventSchema,
  friendRequestInclude,
  friendshipInclude,
  toFriendDto,
  toFriendRequestDto,
  type FriendRequestWithUsers,
  type FriendshipWithUsers,
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
    super('FRIEND_REQUEST_ALREADY_RECEIVED', 409, 'this user has already sent you a friend request')
  }
}

class FriendRequestNotFoundError extends AppError {
  constructor() {
    super('FRIEND_REQUEST_NOT_FOUND', 404, 'friend request not found')
  }
}

// DB가 친구/요청의 최종 상태를 보관하고, 실시간 이벤트는 커밋된 결과를
// 상대 사용자의 모든 연결에 알려 화면을 빠르게 동기화하는 보조 수단이다.
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
    const dto = toFriendDto(friendship, requesterUserId, isUserOnline(acceptorUserId))
    realtime.sendToUser(requesterUserId, 'friend.request_accepted', dto)
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "friend.request_accepted"',
      error instanceof Error ? error.message : error,
    )
  }
}

function publishFriendRequestDeleted(recipientUserId: string, actorUserId: string): void {
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
export async function listFriends(input: { userId: string }) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ user_low_id: input.userId }, { user_high_id: input.userId }],
    },
    include: friendshipInclude,
    orderBy: { created_at: 'desc' },
  })

  return friendships.map((friendship) => {
    const friendUserId = otherUserId(friendship, input.userId)
    return toFriendDto(friendship, input.userId, isUserOnline(friendUserId))
  })
}

export async function listFriendRequests(input: { userId: string }) {
  const requests = await prisma.friendRequest.findMany({
    where: {
      OR: [{ user_low_id: input.userId }, { user_high_id: input.userId }],
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

async function createFriendRequest(userId: string, targetUserId: string) {
  const pair = canonicalFriendPair(userId, targetUserId)
  // 요청 확인과 생성을 한 트랜잭션에서 처리한다. 반대 방향 요청이 이미 있으면
  // 덮어쓰지 않고 수락 흐름을 사용하도록 별도 충돌로 알려준다.
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
        requested_by_id: userId,
      },
      update: {},
      include: friendRequestInclude,
    })

    // 요청 upsert와 친구 수락이 경쟁했을 수 있어 친구 관계를 다시 확인하고
    // 이미 수락됐다면 남은 요청 행을 정리한다.
    const acceptedDuringRequest = await tx.friendship.findUnique({
      where: { user_low_id_user_high_id: pair },
      select: { user_low_id: true },
    })
    if (acceptedDuringRequest) {
      await tx.friendRequest.deleteMany({ where: pair })
      return { request: null }
    }
    if (pending.requested_by_id !== userId) {
      throw new FriendRequestAlreadyReceivedError()
    }
    return { request: pending }
  })

  if (!outcome.request) throw new AlreadyFriendsError()
  publishFriendRequestCreated(targetUserId, outcome.request)
  return toFriendRequestDto(outcome.request, userId)
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

  return createFriendRequest(input.userId, target.id)
}

export async function sendFriendRequestToUser(input: { userId: string; targetUserId: string }) {
  const target = await prisma.user.findFirst({
    where: { id: input.targetUserId, deleted_at: null },
    select: { id: true },
  })
  if (!target) throw new AppError('USER_NOT_FOUND', 404, 'user not found')

  return createFriendRequest(input.userId, target.id)
}

export async function acceptFriendRequest(input: { userId: string; requesterUserId: string }) {
  const pair = canonicalFriendPair(input.userId, input.requesterUserId)
  // 자신에게 온 요청 삭제와 친구 관계 생성을 원자적으로 묶어
  // 존재하지 않는 요청을 임의로 수락하거나 반쪽 상태가 남지 않게 한다.
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
  return toFriendDto(friendship, input.userId, isUserOnline(input.requesterUserId))
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

export async function removeFriend(input: { userId: string; friendUserId: string }): Promise<void> {
  const pair = canonicalFriendPair(input.userId, input.friendUserId)
  const result = await prisma.friendship.deleteMany({ where: pair })
  if (result.count === 0) throw new FriendNotFoundError()
  publishFriendRemoved(input.friendUserId, input.userId)
}
