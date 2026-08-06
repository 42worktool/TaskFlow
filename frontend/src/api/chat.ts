import { apiRequest } from '../services/auth'
import type { WorkspaceMessage } from '../types'

export const ChatAPI = {
  list: (workspaceId: string) =>
    apiRequest<WorkspaceMessage[]>(`/api/workspaces/${workspaceId}/messages`),

  send: (workspaceId: string, content: string, cardId?: string | null) =>
    apiRequest<WorkspaceMessage>(`/api/workspaces/${workspaceId}/messages`, {
      method: 'POST',
      json: {
        content,
        ...(cardId !== undefined ? { card_id: cardId } : {}),
      },
    }),
}
