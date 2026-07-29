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

  it('loads and updates card detail fields through the existing routes', async () => {
    const request = vi.mocked(apiRequest)
    request
      .mockResolvedValueOnce({
        id: 'card-1',
        members: [],
        labels: [],
        attachments: [],
        comments: [],
      })
      .mockResolvedValueOnce({ id: 'card-1', title: 'Updated' })
      .mockResolvedValueOnce({
        id: 'card-1',
        start_at: '2026-07-29T00:00:00.000Z',
        deadline: null,
      })

    await CardAPI.get('card-1')
    await CardAPI.update('card-1', {
      title: 'Updated',
      description: 'Details',
    })
    await CardAPI.updateDates('card-1', {
      start_at: '2026-07-29T00:00:00.000Z',
      deadline: null,
    })

    expect(request).toHaveBeenNthCalledWith(1, '/api/cards/card-1')
    expect(request).toHaveBeenNthCalledWith(2, '/api/cards/card-1', {
      method: 'PUT',
      json: {
        title: 'Updated',
        description: 'Details',
      },
    })
    expect(request).toHaveBeenNthCalledWith(3, '/api/cards/card-1/dates', {
      method: 'PATCH',
      json: {
        start_at: '2026-07-29T00:00:00.000Z',
        deadline: null,
      },
    })
  })
})
