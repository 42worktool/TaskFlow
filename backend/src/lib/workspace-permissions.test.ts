import assert from 'node:assert/strict'
import test from 'node:test'
import type { Role } from '@prisma/client'
import { ForbiddenError } from '../errors'
import {
  getWorkspaceRole,
  hasMinimumWorkspaceRole,
  requireWorkspaceRole,
  type WorkspacePermissionClient,
} from './workspace-permissions'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'

function permissionClient(
  role: Role | null,
  onQuery?: (query: unknown) => void,
): WorkspacePermissionClient {
  return {
    workspaceMember: {
      findFirst: async (query: unknown) => {
        onQuery?.(query)
        return role ? { role } : null
      },
    },
  } as unknown as WorkspacePermissionClient
}

test('workspace roles follow viewer, member, admin, owner order', () => {
  assert.equal(hasMinimumWorkspaceRole('VIEWER', 'VIEWER'), true)
  assert.equal(hasMinimumWorkspaceRole('MEMBER', 'VIEWER'), true)
  assert.equal(hasMinimumWorkspaceRole('ADMIN', 'MEMBER'), true)
  assert.equal(hasMinimumWorkspaceRole('OWNER', 'ADMIN'), true)
  assert.equal(hasMinimumWorkspaceRole('VIEWER', 'MEMBER'), false)
  assert.equal(hasMinimumWorkspaceRole('MEMBER', 'ADMIN'), false)
  assert.equal(hasMinimumWorkspaceRole('ADMIN', 'OWNER'), false)
})

test('getWorkspaceRole queries active membership in an active workspace', async () => {
  let query: unknown
  const role = await getWorkspaceRole(
    WORKSPACE_ID,
    USER_ID,
    permissionClient('MEMBER', (value) => {
      query = value
    }),
  )

  assert.equal(role, 'MEMBER')
  assert.deepEqual(query, {
    where: {
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      deleted_at: null,
      workspace: { deleted_at: null },
    },
    select: { role: true },
  })
})

test('requireWorkspaceRole returns the role when it meets the minimum', async () => {
  const role = await requireWorkspaceRole(
    WORKSPACE_ID,
    USER_ID,
    'MEMBER',
    permissionClient('ADMIN'),
  )

  assert.equal(role, 'ADMIN')
})

test('requireWorkspaceRole keeps the existing forbidden policy', async () => {
  await assert.rejects(
    requireWorkspaceRole(
      WORKSPACE_ID,
      USER_ID,
      'MEMBER',
      permissionClient('VIEWER'),
    ),
    ForbiddenError,
  )
  await assert.rejects(
    requireWorkspaceRole(
      WORKSPACE_ID,
      USER_ID,
      'VIEWER',
      permissionClient(null),
    ),
    ForbiddenError,
  )
})
