// 인박스 카드와 보드 리스트 사이의 이동을 하나의 API 표면으로 묶는다.
import { apiRequest } from '../services/auth'
import { CardAPI } from './card'
import { ListAPI } from './list'
import type { Card } from '../types'

// 패널이 재마운트되어도 이전 패널의 이동·삭제가 끝나기 전에 목록을 읽지 않도록
// 변경 요청을 직렬화한다. 이는 빠른 토글 중 발생하는 낙관적 UI 역전을 막는다.
let inboxMutations: Promise<void> = Promise.resolve()

function queueInboxMutation<T>(operation: () => Promise<T>): Promise<T> {
  const request = inboxMutations.then(operation)
  inboxMutations = request.then(
    () => undefined,
    () => undefined,
  )
  return request
}

export const InboxAPI = {
  async list(): Promise<Card[]> {
    await inboxMutations
    return apiRequest<Card[]>('/api/inbox')
  },

  remove(cardId: string): Promise<void> {
    return queueInboxMutation(() => apiRequest<void>(`/api/cards/${cardId}`, { method: 'DELETE' }))
  },

  moveToInbox: (cardId: string): Promise<Card> =>
    queueInboxMutation(() => CardAPI.moveToInbox(cardId)),

  moveToList: (
    cardId: string,
    listId: string,
    neighbor: {
      before_card_id?: string | null
      after_card_id?: string | null
    } = {},
  ): Promise<Card> =>
    queueInboxMutation(() =>
      CardAPI.move(cardId, {
        list_id: listId,
        ...neighbor,
      }),
    ),

  removeList: (listId: string): Promise<void> => queueInboxMutation(() => ListAPI.remove(listId)),
}
