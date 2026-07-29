import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { apiRequest } from '../services/auth'
import { InboxAPI } from './inbox'

describe('InboxAPI', () => {
  it('waits for an in-flight delete before reading a remounted panel', async () => {
    let finishDelete: (() => void) | undefined
    const deletion = new Promise<void>((resolve) => {
      finishDelete = resolve
    })
    const request = vi.mocked(apiRequest)
    request
      .mockReturnValueOnce(deletion as never)
      .mockResolvedValueOnce([] as never)

    const removePromise = InboxAPI.remove('card-1')
    const listPromise = InboxAPI.list()
    await Promise.resolve()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/cards/card-1',
      { method: 'DELETE' },
    )

    finishDelete?.()
    await expect(removePromise).resolves.toBeUndefined()
    await expect(listPromise).resolves.toEqual([])
    expect(request).toHaveBeenNthCalledWith(2, '/api/inbox')
  })
})
