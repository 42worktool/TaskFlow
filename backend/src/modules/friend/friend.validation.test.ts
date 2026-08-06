import assert from 'node:assert/strict'
import test from 'node:test'
import { friendRequestSchema } from './friend.validation'

test('friend validation normalizes email', () => {
  assert.deepEqual(friendRequestSchema.parse({ email: ' Friend@Example.COM ' }), {
    email: 'friend@example.com',
  })
  assert.throws(() => friendRequestSchema.parse({ email: 'not-an-email' }))
})
