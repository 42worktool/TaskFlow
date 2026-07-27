import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorkspaceSchema,
  inviteWorkspaceMemberSchema,
  updateWorkspaceSchema,
} from './workspace.validation'

test('workspace creation defaults visibility to private', () => {
  assert.deepEqual(createWorkspaceSchema.parse({ name: 'Workspace' }), {
    name: 'Workspace',
    is_public: false,
  })
})

test('workspace validation enforces partial updates and invitation roles', () => {
  assert.throws(() => updateWorkspaceSchema.parse({}))
  assert.equal(updateWorkspaceSchema.parse({ is_public: true }).is_public, true)
  assert.equal(
    inviteWorkspaceMemberSchema.parse({
      email: 'member@example.com',
      role: 'MEMBER',
    }).role,
    'MEMBER',
  )
  assert.throws(() =>
    inviteWorkspaceMemberSchema.parse({
      email: 'not-an-email',
      role: 'OWNER',
    }),
  )
})
