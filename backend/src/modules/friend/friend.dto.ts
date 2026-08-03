import type { FriendRequest, Friendship } from '@prisma/client'
import { z } from 'zod'
import {
  userSummarySelect,
  type SelectedUserSummary,
} from '../../lib/user-summary'

export const friendshipInclude = {
  user_low: { select: userSummarySelect },
  user_high: { select: userSummarySelect },
} as const

export const friendRequestInclude = {
  user_low: { select: userSummarySelect },
  user_high: { select: userSummarySelect },
} as const

export type FriendshipWithUsers = Friendship & {
  user_low: SelectedUserSummary
  user_high: SelectedUserSummary
}

export type FriendRequestWithUsers = FriendRequest & {
  user_low: SelectedUserSummary
  user_high: SelectedUserSummary
}

export const friendUserIdEventSchema = z
  .object({
    user_id: z.uuid(),
  })
  .strict()

export interface FriendDto {
  id: string
  name: string
  profile_image_url: string | null
  friends_since: string
  online: boolean
}

export interface FriendRequestDto {
  id: string
  name: string
  profile_image_url: string | null
  requested_at: string
}

export function toFriendDto(
  friendship: FriendshipWithUsers,
  currentUserId: string,
  online: boolean,
): FriendDto {
  const friend =
    friendship.user_low_id === currentUserId
      ? friendship.user_high
      : friendship.user_low

  return {
    id: friend.id,
    name: friend.name,
    profile_image_url: friend.profile_image_url,
    friends_since: friendship.created_at.toISOString(),
    online,
  }
}

export function toFriendRequestDto(
  request: FriendRequestWithUsers,
  currentUserId: string,
): FriendRequestDto {
  const otherUser =
    request.user_low_id === currentUserId
      ? request.user_high
      : request.user_low

  return {
    id: otherUser.id,
    name: otherUser.name,
    profile_image_url: otherUser.profile_image_url,
    requested_at: request.created_at.toISOString(),
  }
}
