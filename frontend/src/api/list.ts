import type { List, ListWithCards } from '../types'
import { apiRequest } from '../services/auth'

export const ListAPI = {
  listByWorkspace: (workspaceId: string) =>
    apiRequest<ListWithCards[]>(`/api/workspaces/${workspaceId}/lists`),

  create: (workspaceId: string, name: string) =>
    apiRequest<List>(`/api/workspaces/${workspaceId}/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  rename: (listId: string, name: string) =>
    apiRequest<List>(`/api/lists/${listId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  remove: (listId: string) => apiRequest<void>(`/api/lists/${listId}`, { method: 'DELETE' }),

  reorder: (listId: string, neighbor: { before_list_id?: string | null; after_list_id?: string | null }) =>
    apiRequest<List>(`/api/lists/${listId}/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(neighbor),
    }),
}
