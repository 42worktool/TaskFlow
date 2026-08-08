// 워크스페이스 생성과 수정, 초대 역할, 저장된 초대 정보를 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  changeWorkspaceRoleSchema,
  createWorkspaceSchema,
  inviteWorkspaceMemberSchema,
  updateWorkspaceSchema,
  workspaceInvitationSchema,
  workspaceInvitationTokenSchema,
} from '../../../src/modules/workspace/workspace.validation'

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
      email: ' Member@Example.COM ',
      role: 'MEMBER',
    }).email,
    'member@example.com',
  )
  assert.throws(() =>
    inviteWorkspaceMemberSchema.parse({
      email: 'member@example.com',
      role: 'OWNER',
    }),
  )
  assert.throws(() =>
    inviteWorkspaceMemberSchema.parse({
      email: 'not-an-email',
      role: 'MEMBER',
    }),
  )
  assert.equal(changeWorkspaceRoleSchema.parse({ role: 'ADMIN' }).role, 'ADMIN')
  assert.throws(() => changeWorkspaceRoleSchema.parse({ role: 'OWNER' }))
})

test('stored workspace invitations keep only validated membership data', () => {
  assert.deepEqual(
    workspaceInvitationSchema.parse({
      workspaceId: '00000000-0000-4000-8000-000000000002',
      role: 'MEMBER',
      deliveryEmail: 'legacy@example.com',
      createdBy: '00000000-0000-4000-8000-000000000003',
    }),
    {
      workspaceId: '00000000-0000-4000-8000-000000000002',
      role: 'MEMBER',
    },
  )
  assert.throws(() =>
    workspaceInvitationSchema.parse({
      workspaceId: '00000000-0000-4000-8000-000000000002',
      role: 'OWNER',
    }),
  )
  assert.equal(workspaceInvitationTokenSchema.parse('a'.repeat(43)).length, 43)
  assert.throws(() => workspaceInvitationTokenSchema.parse('a'.repeat(42)))
})
