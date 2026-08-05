import type { Card, CardAttachment, CardComment, CardDetail } from '../types'
import { apiRequest } from '../services/auth'
import { downloadFile, fetchBlob, uploadFile } from '../services/fileTransfer'

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

  updateCompletion: (cardId: string, isCompleted: boolean) =>
    apiRequest<Card>(`/api/cards/${cardId}/completion`, {
      method: 'PATCH',
      json: { is_completed: isCompleted },
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

  createComment: (cardId: string, comment: string) =>
    apiRequest<CardComment>(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      json: { comment_str: comment },
    }),

  removeComment: (commentId: string) =>
    apiRequest<void>(`/api/cards/comments/${commentId}`, { method: 'DELETE' }),

  uploadAttachment: (cardId: string, file: File, onProgress?: (percent: number) => void) =>
    uploadFile<CardAttachment>(`/api/cards/${cardId}/attachments`, file, onProgress),

  removeAttachment: (attachmentId: string) =>
    apiRequest<void>(`/api/cards/attachments/${attachmentId}`, { method: 'DELETE' }),

  downloadAttachment: (attachmentId: string, fileName: string) =>
    downloadFile(`/api/cards/attachments/${attachmentId}/download`, fileName),

  fetchAttachmentBlob: (attachmentId: string) =>
    fetchBlob(`/api/cards/attachments/${attachmentId}/download`),
}
