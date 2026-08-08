// 프로필 사용자와 현재 사용자의 관계를 친구 버튼이 소비할 하나의 상태로 축약한다.
import type { Friend, FriendRequest } from '../types'

export type FriendRelationship = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none'

export function resolveFriendRelationship(
  userId: string,
  currentUserId: string | undefined,
  friends: Friend[],
  incoming: FriendRequest[],
  outgoing: FriendRequest[],
): FriendRelationship {
  // 확정 관계를 요청보다 먼저 판단해 지연된 요청 목록이 친구 UI를 덮지 않게 한다.
  if (userId === currentUserId) return 'self'
  if (friends.some((friend) => friend.id === userId)) return 'friend'
  if (incoming.some((request) => request.id === userId)) return 'incoming'
  if (outgoing.some((request) => request.id === userId)) return 'outgoing'
  return 'none'
}
