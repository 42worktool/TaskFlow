import { apiRequest } from '../services/auth'
import type { Friend } from '../types'

export const FriendAPI = {
  list: () => apiRequest<Friend[]>('/api/friends'),

  add: (email: string) =>
    apiRequest<Friend>('/api/friends', {
      method: 'POST',
      json: { email },
    }),

  remove: (friendUserId: string) =>
    apiRequest<void>(`/api/friends/${friendUserId}`, {
      method: 'DELETE',
    }),
}
