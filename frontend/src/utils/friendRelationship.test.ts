import { describe, expect, it } from 'vitest'
import type { Friend, FriendRequest } from '../types'
import { resolveFriendRelationship } from './friendRelationship'

const friend = { id: 'friend-1' } as Friend
const incoming = { id: 'incoming-1' } as FriendRequest
const outgoing = { id: 'outgoing-1' } as FriendRequest

describe('resolveFriendRelationship', () => {
  it.each([
    ['me', 'self'],
    ['friend-1', 'friend'],
    ['incoming-1', 'incoming'],
    ['outgoing-1', 'outgoing'],
    ['new-user', 'none'],
  ] as const)('resolves %s as %s', (userId, expected) => {
    expect(resolveFriendRelationship(userId, 'me', [friend], [incoming], [outgoing])).toBe(expected)
  })
})
