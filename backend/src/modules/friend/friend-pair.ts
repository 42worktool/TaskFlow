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

export function canonicalFriendPair(
  userId: string,
  friendUserId: string,
): FriendPair {
  if (userId === friendUserId) throw new CannotFriendSelfError()
  return userId < friendUserId
    ? { user_low_id: userId, user_high_id: friendUserId }
    : { user_low_id: friendUserId, user_high_id: userId }
}

export function otherUserId(
  pair: FriendPair,
  currentUserId: string,
): string {
  return pair.user_low_id === currentUserId
    ? pair.user_high_id
    : pair.user_low_id
}
