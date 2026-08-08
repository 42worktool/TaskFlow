// 카드 상세, 정렬·이동, 댓글, 첨부파일에 관한 HTTP 계약을 한곳에 모은다.
// 화면은 엔드포인트 형식을 알지 않고 카드 ID와 변경 내용만 전달하도록 분리했다.
import type { Card, CardAttachment, CardComment, CardDetail } from '../types'
import { apiRequest } from '../services/auth'
import { downloadFile, fetchBlob, uploadFile } from '../services/fileTransfer'

export const CardAPI = {
  get: (cardId: string) => apiRequest<CardDetail>(`/api/cards/${cardId}`),

  create: (listId: string, data: { title: string; description?: string | null }) =>
    apiRequest<Card>(`/api/lists/${listId}/cards`, {
      method: 'POST',
      json: data,
    }),

  update: (cardId: string, data: { title?: string; description?: string | null }) =>
    apiRequest<Card>(`/api/cards/${cardId}`, {
      method: 'PUT',
      json: data,
    }),

  updateDates: (cardId: string, data: { start_at?: string | null; deadline?: string | null }) =>
    apiRequest<Card>(`/api/cards/${cardId}/dates`, {
      method: 'PATCH',
      json: data,
    }),

  updateCompletion: (cardId: string, isCompleted: boolean) =>
    apiRequest<Card>(`/api/cards/${cardId}/completion`, {
      method: 'PATCH',
      json: { is_completed: isCompleted },
    }),

  reorder: (
    cardId: string,
    neighbor: { before_card_id?: string | null; after_card_id?: string | null },
  ) =>
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

  updateComment: (commentId: string, comment: string) =>
    apiRequest<CardComment>(`/api/comments/${commentId}`, {
      method: 'PATCH',
      json: { comment_str: comment },
    }),

  removeComment: (commentId: string) =>
    apiRequest<void>(`/api/comments/${commentId}`, { method: 'DELETE' }),

  uploadAttachment: (cardId: string, file: File, onProgress?: (percent: number) => void) =>
    uploadFile<CardAttachment>(`/api/cards/${cardId}/attachments`, file, onProgress),

  removeAttachment: (attachmentId: string) =>
    apiRequest<void>(`/api/cards/attachments/${attachmentId}`, { method: 'DELETE' }),

  downloadAttachment: (attachmentId: string, fileName: string) =>
    downloadFile(`/api/cards/attachments/${attachmentId}/download`, fileName),

  fetchAttachmentBlob: (attachmentId: string) =>
    fetchBlob(`/api/cards/attachments/${attachmentId}/download`),
}
