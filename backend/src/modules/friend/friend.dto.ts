import type { Friendship, User } from '@prisma/client'

const friendUserSelect = {
  id: true,
  name: true,
  profile_image_url: true,
} as const

export const friendshipInclude = {
  user_low: { select: friendUserSelect },
  user_high: { select: friendUserSelect },
} as const

type FriendshipWithUsers = Friendship & {
  user_low: Pick<User, 'id' | 'name' | 'profile_image_url'>
  user_high: Pick<User, 'id' | 'name' | 'profile_image_url'>
}

export interface FriendDto {
  id: string
  name: string
  profile_image_url: string | null
  friends_since: string
  online: boolean
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
