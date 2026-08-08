// DM 입력의 정규화와 프로토타입에서 정한 내용 길이 제한을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDirectMessageSchema } from '../../../src/modules/friend/direct-message.validation'

test('direct message validation trims content and enforces the prototype limit', () => {
  assert.deepEqual(createDirectMessageSchema.parse({ content: ' hello ' }), { content: 'hello' })
  assert.throws(() => createDirectMessageSchema.parse({ content: '   ' }))
  assert.throws(() => createDirectMessageSchema.parse({ content: 'x'.repeat(1001) }))
  assert.throws(() => createDirectMessageSchema.parse({ content: 'hello', extra: true }))
})
