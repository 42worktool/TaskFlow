import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { ListAPI } from './list'
import { apiRequest } from '../services/auth'

describe('ListAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('loads one list with its cards', async () => {
    const list = {
      id: 'list-1',
      workspace_id: 'workspace-1',
      name: 'Todo',
      sequence: 1,
      cards: [],
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(list)

    await expect(ListAPI.get('list-1')).resolves.toEqual(list)
    expect(apiRequest).toHaveBeenCalledWith('/api/lists/list-1')
  })
})
