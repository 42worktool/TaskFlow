import assert from 'node:assert/strict'
import test from 'node:test'
import { createDirectMessageSchema } from './direct-message.validation'

test('direct message validation trims content and enforces the prototype limit', () => {
  assert.deepEqual(
    createDirectMessageSchema.parse({ content: ' hello ' }),
    { content: 'hello' },
  )
  assert.throws(() => createDirectMessageSchema.parse({ content: '   ' }))
  assert.throws(() =>
    createDirectMessageSchema.parse({ content: 'x'.repeat(1001) }),
  )
  assert.throws(() =>
    createDirectMessageSchema.parse({ content: 'hello', extra: true }),
  )
})
