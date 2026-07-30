import { apiRequest } from '../services/auth'
import type {
  DirectMessage,
  Friend,
  FriendRequest,
  FriendRequestLists,
} from '../types'

// A newly opened drawer must not read ahead of a mutation started by the
// previous drawer instance.
let friendMutations: Promise<void> = Promise.resolve()

function queueFriendMutation<T>(operation: () => Promise<T>): Promise<T> {
  const request = friendMutations.then(operation)
  friendMutations = request.then(
    () => undefined,
    () => undefined,
  )
  return request
}

export const FriendAPI = {
  async list(): Promise<Friend[]> {
    await friendMutations
    return apiRequest<Friend[]>('/api/friends')
  },

  async listRequests(): Promise<FriendRequestLists> {
    await friendMutations
    return apiRequest<FriendRequestLists>('/api/friends/requests')
  },

  listMessages: (friendUserId: string) =>
    apiRequest<DirectMessage[]>(`/api/friends/${friendUserId}/messages`),

  sendMessage: (friendUserId: string, content: string) =>
    apiRequest<DirectMessage>(`/api/friends/${friendUserId}/messages`, {
      method: 'POST',
      json: { content },
    }),

  sendRequest: (email: string) =>
    queueFriendMutation(() =>
      apiRequest<FriendRequest>('/api/friends/requests', {
        method: 'POST',
        json: { email },
      }),
    ),

  acceptRequest: (friendUserId: string) =>
    queueFriendMutation(() =>
      apiRequest<Friend>(`/api/friends/requests/${friendUserId}/accept`, {
        method: 'POST',
      }),
    ),

  deleteRequest: (friendUserId: string) =>
    queueFriendMutation(() =>
      apiRequest<void>(`/api/friends/requests/${friendUserId}`, {
        method: 'DELETE',
      }),
    ),

  remove: (friendUserId: string) =>
    queueFriendMutation(() =>
      apiRequest<void>(`/api/friends/${friendUserId}`, {
        method: 'DELETE',
      }),
    ),
}
