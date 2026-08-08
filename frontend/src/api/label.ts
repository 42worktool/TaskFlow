// 워크스페이스 레이블의 생명주기와 카드 연결·해제를 표현하는 API 모듈이다.
import type { Label } from '../types'
import { apiRequest } from '../services/auth'

export const LabelAPI = {
  list: (workspaceId: string) => apiRequest<Label[]>(`/api/workspaces/${workspaceId}/labels`),

  create: (workspaceId: string, data: { label_name: string; label_color: string }) =>
    apiRequest<Label>(`/api/workspaces/${workspaceId}/labels`, {
      method: 'POST',
      json: data,
    }),

  update: (labelId: string, patch: { label_name?: string; label_color?: string }) =>
    apiRequest<Label>(`/api/labels/${labelId}`, {
      method: 'PUT',
      json: patch,
    }),

  remove: (labelId: string) => apiRequest<void>(`/api/labels/${labelId}`, { method: 'DELETE' }),

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
