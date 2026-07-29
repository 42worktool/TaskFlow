import assert from 'node:assert/strict'
import test from 'node:test'
import { friendRequestSchema, friendUserIdSchema } from './friend.validation'

test('friend validation normalizes email and requires a UUID path id', () => {
  assert.deepEqual(
    friendRequestSchema.parse({ email: ' Friend@Example.COM ' }),
    { email: 'friend@example.com' },
  )
  assert.throws(() => friendRequestSchema.parse({ email: 'not-an-email' }))
  assert.equal(
    friendUserIdSchema.parse('00000000-0000-4000-8000-000000000001'),
    '00000000-0000-4000-8000-000000000001',
  )
  assert.equal(
    friendUserIdSchema.parse('AAAAAAAA-0000-4000-8000-000000000001'),
    'aaaaaaaa-0000-4000-8000-000000000001',
  )
  assert.throws(() => friendUserIdSchema.parse('friend-1'))
})
