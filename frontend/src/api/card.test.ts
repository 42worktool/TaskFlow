import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { CardAPI } from './card'
import { apiRequest } from '../services/auth'

describe('CardAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('moves a card to the signed-in user inbox', async () => {
    const moved = {
      id: 'card-1',
      list_id: null,
      title: 'Inbox card',
      description: null,
      start_at: null,
      deadline: null,
      sequence: 1,
      created_at: '2026-07-29T00:00:00.000Z',
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(moved)

    await expect(CardAPI.moveToInbox('card-1')).resolves.toEqual(moved)
    expect(apiRequest).toHaveBeenCalledWith('/api/cards/card-1/inbox', {
      method: 'PUT',
    })
  })
})
