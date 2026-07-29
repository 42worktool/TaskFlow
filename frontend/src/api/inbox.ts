import { apiRequest } from '../services/auth'
import type { Card } from '../types'

// A remounted panel must not read while an earlier panel is still deleting.
let inboxMutations: Promise<void> = Promise.resolve()

export const InboxAPI = {
  async list(): Promise<Card[]> {
    await inboxMutations
    return apiRequest<Card[]>('/api/inbox')
  },

  remove(cardId: string): Promise<void> {
    const request = inboxMutations.then(() =>
      apiRequest<void>(`/api/cards/${cardId}`, { method: 'DELETE' }),
    )
    inboxMutations = request.catch(() => undefined)
    return request
  },
}
