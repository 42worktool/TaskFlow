import { apiRequest } from '../services/auth'
import type { WorkspaceMessage } from '../types'

export const ChatAPI = {
  list: (workspaceId: string) =>
    apiRequest<WorkspaceMessage[]>(`/api/workspaces/${workspaceId}/messages`),

  send: (workspaceId: string, content: string) =>
    apiRequest<WorkspaceMessage>(`/api/workspaces/${workspaceId}/messages`, {
      method: 'POST',
      json: { content },
    }),
}
