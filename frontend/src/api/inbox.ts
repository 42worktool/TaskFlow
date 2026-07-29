import { apiRequest } from '../services/auth'
import { CardAPI } from './card'
import { ListAPI } from './list'
import type { Card } from '../types'

// A remounted panel must not read while an earlier panel is still mutating.
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
    return queueInboxMutation(() =>
      apiRequest<void>(`/api/cards/${cardId}`, { method: 'DELETE' }),
    )
  },

  moveToInbox: (cardId: string): Promise<Card> =>
    queueInboxMutation(() => CardAPI.moveToInbox(cardId)),

  moveToList: (cardId: string, listId: string): Promise<Card> =>
    queueInboxMutation(() =>
      CardAPI.move(cardId, {
        list_id: listId,
      }),
    ),

  removeList: (listId: string): Promise<void> =>
    queueInboxMutation(() => ListAPI.remove(listId)),
}
