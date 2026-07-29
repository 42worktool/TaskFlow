import { describe, expect, it } from 'vitest'
import { parseFriendPresenceEvent } from './protocol'

describe('friend presence protocol', () => {
  it('accepts the minimal presence event', () => {
    expect(
      parseFriendPresenceEvent({
        user_id: '00000000-0000-4000-8000-000000000001',
        online: true,
      }),
    ).toEqual({
      user_id: '00000000-0000-4000-8000-000000000001',
      online: true,
    })
  })

  it('rejects malformed presence data', () => {
    expect(
      parseFriendPresenceEvent({ user_id: 'user-1', online: true }),
    ).toBeNull()
    expect(
      parseFriendPresenceEvent({ user_id: '', online: false }),
    ).toBeNull()
  })
})
