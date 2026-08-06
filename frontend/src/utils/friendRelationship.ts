import type { Friend, FriendRequest } from '../types'

export type FriendRelationship = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none'

export function resolveFriendRelationship(
  userId: string,
  currentUserId: string | undefined,
  friends: Friend[],
  incoming: FriendRequest[],
  outgoing: FriendRequest[],
): FriendRelationship {
  if (userId === currentUserId) return 'self'
  if (friends.some((friend) => friend.id === userId)) return 'friend'
  if (incoming.some((request) => request.id === userId)) return 'incoming'
  if (outgoing.some((request) => request.id === userId)) return 'outgoing'
  return 'none'
}
