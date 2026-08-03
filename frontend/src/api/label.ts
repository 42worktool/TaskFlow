import type { Label } from '../types'
import { apiRequest } from '../services/auth'

export const LabelAPI = {
  list: (workspaceId: string) =>
    apiRequest<Label[]>(`/api/workspaces/${workspaceId}/labels`),

  create: (workspaceId: string, data: { label_name: string; label_color: string }) =>
    apiRequest<Label>(`/api/workspaces/${workspaceId}/labels`, {
      method: 'POST',
      json: data,
    }),

  remove: (labelId: string) =>
    apiRequest<void>(`/api/labels/${labelId}`, { method: 'DELETE' }),

  attach: (cardId: string, labelId: string) =>
    apiRequest<Label>(`/api/cards/${cardId}/labels`, {
      method: 'POST',
      json: { label_id: labelId },
    }),

  detach: (cardId: string, labelId: string) =>
    apiRequest<void>(`/api/cards/${cardId}/labels/${labelId}`, {
      method: 'DELETE',
    }),
}
