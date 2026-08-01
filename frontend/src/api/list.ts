import type { List, ListWithCards } from '../types'
import { apiRequest } from '../services/auth'

export const ListAPI = {
  listByWorkspace: (workspaceId: string) =>
    apiRequest<ListWithCards[]>(`/api/workspaces/${workspaceId}/lists`),

  get: (listId: string) =>
    apiRequest<ListWithCards>(`/api/lists/${listId}`),

  create: (workspaceId: string, name: string) =>
    apiRequest<List>(`/api/workspaces/${workspaceId}/lists`, {
      method: 'POST',
      json: { name },
    }),

  update: (listId: string, name: string) =>
    apiRequest<List>(`/api/lists/${listId}`, {
      method: 'PUT',
      json: { name },
    }),

  rename: (listId: string, name: string) =>
    ListAPI.update(listId, name),

  remove: (listId: string) => apiRequest<void>(`/api/lists/${listId}`, { method: 'DELETE' }),

  reorder: (listId: string, neighbor: { before_list_id?: string | null; after_list_id?: string | null }) =>
    apiRequest<List>(`/api/lists/${listId}/order`, {
      method: 'PUT',
      json: neighbor,
    }),
}
