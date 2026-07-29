import type { Card, CardDetail } from '../types'
import { apiRequest } from '../services/auth'

export const CardAPI = {
  get: (cardId: string) =>
    apiRequest<CardDetail>(`/api/cards/${cardId}`),

  create: (listId: string, data: { title: string; description?: string | null }) =>
    apiRequest<Card>(`/api/lists/${listId}/cards`, {
      method: 'POST',
      json: data,
    }),

  update: (
    cardId: string,
    data: { title?: string; description?: string | null },
  ) =>
    apiRequest<Card>(`/api/cards/${cardId}`, {
      method: 'PUT',
      json: data,
    }),

  updateDates: (
    cardId: string,
    data: { start_at?: string | null; deadline?: string | null },
  ) =>
    apiRequest<Card>(`/api/cards/${cardId}/dates`, {
      method: 'PATCH',
      json: data,
    }),

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
