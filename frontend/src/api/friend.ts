import { apiRequest } from '../services/auth'
import type { Friend, FriendRequest, FriendRequestLists } from '../types'

export const FriendAPI = {
  list: () => apiRequest<Friend[]>('/api/friends'),

  listRequests: () =>
    apiRequest<FriendRequestLists>('/api/friends/requests'),

  sendRequest: (email: string) =>
    apiRequest<FriendRequest>('/api/friends/requests', {
      method: 'POST',
      json: { email },
    }),

  acceptRequest: (friendUserId: string) =>
    apiRequest<Friend>(`/api/friends/requests/${friendUserId}/accept`, {
      method: 'POST',
    }),

  deleteRequest: (friendUserId: string) =>
    apiRequest<void>(`/api/friends/requests/${friendUserId}`, {
      method: 'DELETE',
    }),

  remove: (friendUserId: string) =>
    apiRequest<void>(`/api/friends/${friendUserId}`, {
      method: 'DELETE',
    }),
}
