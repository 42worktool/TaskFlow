import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { FriendAPI } from './friend'
import { apiRequest } from '../services/auth'

describe('FriendAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('loads accepted friends and pending requests separately', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ incoming: [], outgoing: [] })

    await FriendAPI.list()
    await FriendAPI.listRequests()

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/friends')
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/friends/requests')
  })

  it('sends a friend request by email', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      id: 'user-2',
      name: 'Friend',
      profile_image_url: null,
      requested_at: '2026-07-29T00:00:00.000Z',
    })

    await FriendAPI.sendRequest('friend@example.com')

    expect(apiRequest).toHaveBeenCalledWith('/api/friends/requests', {
      method: 'POST',
      json: { email: 'friend@example.com' },
    })
  })

  it('accepts, rejects or cancels pending requests', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ id: 'user-2' })
      .mockResolvedValueOnce(undefined)

    await FriendAPI.acceptRequest('user-2')
    await FriendAPI.deleteRequest('user-2')

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/friends/requests/user-2/accept',
      { method: 'POST' },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/friends/requests/user-2',
      { method: 'DELETE' },
    )
  })

  it('removes an accepted friend without touching pending requests', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined)

    await FriendAPI.remove('user-2')

    expect(apiRequest).toHaveBeenCalledWith('/api/friends/user-2', {
      method: 'DELETE',
    })
  })
})
