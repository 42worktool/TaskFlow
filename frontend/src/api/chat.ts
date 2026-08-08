// 워크스페이스 대화 내역과 메시지 전송을 담당하는 REST API다.
// REST는 영속화와 최신 이력 snapshot을 맡고, WebSocket은 생성된 메시지 DTO를
// 열린 대화에 즉시 전달해 화면을 갱신한다.
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
