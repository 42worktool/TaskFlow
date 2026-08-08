// 자기 자신·친구·받은 요청·보낸 요청·새 관계 사이의 우선순위를 검증한다.
import { describe, expect, it } from 'vitest'
import type { Friend, FriendRequest } from '../../src/types'
import { resolveFriendRelationship } from '../../src/utils/friendRelationship'

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
