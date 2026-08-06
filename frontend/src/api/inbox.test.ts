import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { apiRequest } from '../services/auth'
import { InboxAPI } from './inbox'

describe('InboxAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('waits for an in-flight delete before reading a remounted panel', async () => {
    let finishDelete: (() => void) | undefined
    const deletion = new Promise<void>((resolve) => {
      finishDelete = resolve
    })
    const request = vi.mocked(apiRequest)
    request.mockReturnValueOnce(deletion as never).mockResolvedValueOnce([] as never)

    const removePromise = InboxAPI.remove('card-1')
    const listPromise = InboxAPI.list()
    await Promise.resolve()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenNthCalledWith(1, '/api/cards/card-1', { method: 'DELETE' })

    finishDelete?.()
    await expect(removePromise).resolves.toBeUndefined()
    await expect(listPromise).resolves.toEqual([])
    expect(request).toHaveBeenNthCalledWith(2, '/api/inbox')
  })

  it('waits for an in-flight card move before reading a remounted panel', async () => {
    let finishMove: ((card: { id: string; list_id: string }) => void) | undefined
    const move = new Promise<{ id: string; list_id: string }>((resolve) => {
      finishMove = resolve
    })
    const request = vi.mocked(apiRequest)
    request.mockReturnValueOnce(move as never).mockResolvedValueOnce([] as never)

    const movePromise = InboxAPI.moveToList('card-1', 'list-1', {
      before_card_id: 'card-before',
      after_card_id: 'card-after',
    })
    const listPromise = InboxAPI.list()
    await Promise.resolve()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenNthCalledWith(1, '/api/cards/card-1/move', {
      method: 'PUT',
      json: {
        list_id: 'list-1',
        before_card_id: 'card-before',
        after_card_id: 'card-after',
      },
    })

    finishMove?.({ id: 'card-1', list_id: 'list-1' })
    await expect(movePromise).resolves.toMatchObject({
      id: 'card-1',
      list_id: 'list-1',
    })
    await expect(listPromise).resolves.toEqual([])
    expect(request).toHaveBeenNthCalledWith(2, '/api/inbox')
  })
})
