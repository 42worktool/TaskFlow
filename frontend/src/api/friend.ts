// 친구 목록·요청·DM의 REST 계약을 제공하고, 친구 관계 변경은 호출 순서를 보장한다.
import { apiRequest } from '../services/auth'
import type { DirectMessage, Friend, FriendRequest, FriendRequestLists } from '../types'

// 닫혔다 다시 열린 패널이 이전 패널에서 아직 처리 중인 변경보다 먼저 목록을 읽으면
// 오래된 관계가 순간적으로 보일 수 있으므로 모든 친구 변경을 하나의 직렬 큐로 묶는다.
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

  sendRequestToUser: (friendUserId: string) =>
    queueFriendMutation(() =>
      apiRequest<FriendRequest>(`/api/friends/requests/${friendUserId}`, {
        method: 'POST',
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
