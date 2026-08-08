// 목록 조회와 변경, 순서 재배치 요청 규약을 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { ListAPI } from '../../src/api/list'
import { apiRequest } from '../../src/services/auth'

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

  it('updates the name of a list', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      id: 'list-1',
      workspace_id: 'workspace-1',
      name: 'Done',
      sequence: 1,
    })

    await ListAPI.update('list-1', 'Done')

    expect(apiRequest).toHaveBeenCalledWith('/api/lists/list-1', {
      method: 'PUT',
      json: { name: 'Done' },
    })
  })

  it('keeps rename as a small update wrapper', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      id: 'list-1',
      workspace_id: 'workspace-1',
      name: 'Review',
      sequence: 1,
    })

    await ListAPI.rename('list-1', 'Review')

    expect(apiRequest).toHaveBeenCalledWith('/api/lists/list-1', {
      method: 'PUT',
      json: { name: 'Review' },
    })
  })
})
