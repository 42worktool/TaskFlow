import assert from 'node:assert/strict'
import test from 'node:test'
import type { User, Workspace, WorkspaceMember } from '@prisma/client'
import { toWorkspaceDto } from './workspace.dto'

const timestamp = new Date('2026-07-27T00:00:00Z')

test('workspace DTO serializes dates and nested member identities', () => {
  const workspace = {
    id: 'workspace-id',
    name: 'Workspace',
    is_public: false,
    created_at: timestamp,
    created_by: 'user-id',
    updated_at: timestamp,
    updated_by: 'user-id',
    deleted_at: null,
    deleted_by: null,
    members: [
      {
        workspace_id: 'workspace-id',
        user_id: 'user-id',
        role: 'OWNER',
        created_at: timestamp,
        created_by: 'user-id',
        updated_at: timestamp,
        updated_by: 'user-id',
        deleted_at: null,
        deleted_by: null,
        user: {
          id: 'user-id',
          name: 'User',
          email: 'user@example.com',
          profile_image_url: null,
        },
      },
    ],
  } satisfies Workspace & {
    members: (WorkspaceMember & {
      user: Pick<User, 'id' | 'name' | 'email' | 'profile_image_url'>
    })[]
  }

  const dto = toWorkspaceDto(workspace, { includeMemberEmail: true })
  assert.equal(dto.created_at, timestamp.toISOString())
  assert.deepEqual(dto.members[0]?.user, {
    id: 'user-id',
    name: 'User',
    email: 'user@example.com',
    profile_image_url: null,
  })

  const publicDto = toWorkspaceDto(workspace, {
    includeMemberEmail: false,
  })
  assert.deepEqual(publicDto.members[0]?.user, {
    id: 'user-id',
    name: 'User',
    profile_image_url: null,
  })
})
