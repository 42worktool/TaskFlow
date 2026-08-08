import { AppError } from '../../errors'

export interface FriendPair {
  user_low_id: string
  user_high_id: string
}

class CannotFriendSelfError extends AppError {
  constructor() {
    super('CANNOT_FRIEND_SELF', 400, 'you cannot add yourself as a friend')
  }
}

export function canonicalFriendPair(userId: string, friendUserId: string): FriendPair {
  // 친구 관계는 방향이 없으므로 두 ID를 항상 같은 순서로 저장해
  // A-B와 B-A가 별도 행으로 생기지 않게 한다.
  if (userId === friendUserId) throw new CannotFriendSelfError()
  return userId < friendUserId
    ? { user_low_id: userId, user_high_id: friendUserId }
    : { user_low_id: friendUserId, user_high_id: userId }
}

export function otherUserId(pair: FriendPair, currentUserId: string): string {
  return pair.user_low_id === currentUserId ? pair.user_high_id : pair.user_low_id
}
