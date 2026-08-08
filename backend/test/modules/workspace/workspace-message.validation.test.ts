// 워크스페이스 메시지의 내용 길이 제한과 선택적 카드 참조를 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkspaceMessageSchema } from '../../../src/modules/workspace/workspace-message.validation'

const CARD_ID = '00000000-0000-4000-8000-000000000001'

test('workspace message validation trims content and enforces the prototype limit', () => {
  assert.deepEqual(createWorkspaceMessageSchema.parse({ content: ' hello ' }), { content: 'hello' })
  assert.throws(() => createWorkspaceMessageSchema.parse({ content: '   ' }))
  assert.throws(() => createWorkspaceMessageSchema.parse({ content: 'x'.repeat(1001) }))
  assert.throws(() => createWorkspaceMessageSchema.parse({ content: 'hello', extra: true }))
})

test('workspace message validation accepts an optional selected card', () => {
  assert.deepEqual(
    createWorkspaceMessageSchema.parse({
      content: ' linked comment ',
      card_id: CARD_ID,
    }),
    {
      content: 'linked comment',
      card_id: CARD_ID,
    },
  )
  assert.deepEqual(
    createWorkspaceMessageSchema.parse({
      content: 'plain chat',
      card_id: null,
    }),
    {
      content: 'plain chat',
      card_id: null,
    },
  )
  assert.throws(() =>
    createWorkspaceMessageSchema.parse({
      content: 'invalid card',
      card_id: 'not-a-uuid',
    }),
  )
})
