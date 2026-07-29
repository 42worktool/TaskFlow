import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { ChatAPI } from './chat'
import { apiRequest } from '../services/auth'

describe('ChatAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('loads workspace messages', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce([])

    await expect(ChatAPI.list('workspace-1')).resolves.toEqual([])
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/workspaces/workspace-1/messages',
    )
  })

  it('sends a workspace message', async () => {
    const message = {
      id: 'message-1',
      workspace_id: 'workspace-1',
      content: '안녕하세요',
      created_at: '2026-07-29T00:00:00.000Z',
      author: {
        user_id: 'user-1',
        name: 'Sean',
        profile_image_url: null,
      },
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(message)

    await expect(
      ChatAPI.send('workspace-1', '안녕하세요'),
    ).resolves.toEqual(message)
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/workspaces/workspace-1/messages',
      {
        method: 'POST',
        json: { content: '안녕하세요' },
      },
    )
  })
})
