// 친구 요청에서 사용자 식별 입력을 정규화하는 방식을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { friendRequestSchema } from '../../../src/modules/friend/friend.validation'

test('friend validation normalizes email', () => {
  assert.deepEqual(friendRequestSchema.parse({ email: ' Friend@Example.COM ' }), {
    email: 'friend@example.com',
  })
  assert.throws(() => friendRequestSchema.parse({ email: 'not-an-email' }))
})
