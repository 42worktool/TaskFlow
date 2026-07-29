import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkspaceMessageSchema } from './workspace-message.validation'

test('workspace message validation trims content and enforces the prototype limit', () => {
  assert.deepEqual(
    createWorkspaceMessageSchema.parse({ content: ' hello ' }),
    { content: 'hello' },
  )
  assert.throws(() => createWorkspaceMessageSchema.parse({ content: '   ' }))
  assert.throws(() =>
    createWorkspaceMessageSchema.parse({ content: 'x'.repeat(1001) }),
  )
  assert.throws(() =>
    createWorkspaceMessageSchema.parse({ content: 'hello', extra: true }),
  )
})
