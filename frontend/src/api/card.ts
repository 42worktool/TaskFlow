import type { Card } from '../types'
import { apiRequest } from '../services/auth'

export const CardAPI = {
  create: (listId: string, data: { title: string; description?: string | null }) =>
    apiRequest<Card>(`/api/lists/${listId}/cards`, {
      method: 'POST',
      json: data,
    }),

  remove: (cardId: string) => apiRequest<void>(`/api/cards/${cardId}`, { method: 'DELETE' }),

  reorder: (cardId: string, neighbor: { before_card_id?: string | null; after_card_id?: string | null }) =>
    apiRequest<Card>(`/api/cards/${cardId}/order`, {
      method: 'PUT',
      json: neighbor,
    }),

  move: (
    cardId: string,
    data: { list_id: string; before_card_id?: string | null; after_card_id?: string | null },
  ) =>
    apiRequest<Card>(`/api/cards/${cardId}/move`, {
      method: 'PUT',
      json: data,
    }),

  moveToInbox: (cardId: string) =>
    apiRequest<Card>(`/api/cards/${cardId}/inbox`, {
      method: 'PUT',
    }),
}
