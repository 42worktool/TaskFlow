import { describe, expect, it } from 'vitest'
import type { Workspace } from '../types'
import {
  canChangeWorkspaceMemberRole,
  hasWorkspaceRole,
  partitionWorkspacesByOwnership,
  workspaceMemberNameFor,
  workspaceRoleFor,
} from './workspacePermissions'

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Prototype',
  is_public: true,
  created_at: '2026-07-29T00:00:00.000Z',
  updated_at: '2026-07-29T00:00:00.000Z',
  members: [
    {
      user_id: 'owner-1',
      role: 'OWNER',
      user: {
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@example.com',
        profile_image_url: null,
      },
    },
    {
      user_id: 'viewer-1',
      role: 'VIEWER',
      user: {
        id: 'viewer-1',
        name: 'Viewer',
        email: 'viewer@example.com',
        profile_image_url: null,
      },
    },
  ],
}

describe('workspace permissions', () => {
  it('finds the current membership role', () => {
    expect(workspaceRoleFor(workspace, 'owner-1')).toBe('OWNER')
    expect(workspaceRoleFor(workspace, 'visitor-1')).toBeNull()
    expect(workspaceRoleFor(workspace, undefined)).toBeNull()
  })

  it('finds a workspace member name', () => {
    expect(workspaceMemberNameFor(workspace.members, 'owner-1')).toBe('Owner')
    expect(workspaceMemberNameFor(workspace.members, 'visitor-1')).toBeNull()
  })

  it.each([
    ['OWNER', true],
    ['ADMIN', true],
    ['MEMBER', true],
    ['VIEWER', false],
    [null, false],
  ] as const)('checks MEMBER+ board access for %s', (role, expected) => {
    expect(hasWorkspaceRole(role, 'MEMBER')).toBe(expected)
  })

  it('keeps administration and ownership thresholds distinct', () => {
    expect(hasWorkspaceRole('OWNER', 'ADMIN')).toBe(true)
    expect(hasWorkspaceRole('ADMIN', 'ADMIN')).toBe(true)
    expect(hasWorkspaceRole('MEMBER', 'ADMIN')).toBe(false)
    expect(hasWorkspaceRole('OWNER', 'OWNER')).toBe(true)
    expect(hasWorkspaceRole('ADMIN', 'OWNER')).toBe(false)
  })

  it.each([
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'MEMBER', true],
    ['ADMIN', 'ADMIN', true],
    ['ADMIN', 'VIEWER', true],
    ['MEMBER', 'VIEWER', false],
    ['VIEWER', 'MEMBER', false],
    [null, 'MEMBER', false],
    ['OWNER', 'OWNER', false],
    ['ADMIN', 'OWNER', false],
  ] as const)(
    'allows %s to manage a %s role: %s',
    (callerRole, targetRole, expected) => {
      expect(canChangeWorkspaceMemberRole(callerRole, targetRole)).toBe(expected)
    },
  )

  it('separates owned projects from non-owner memberships', () => {
    const owned = workspace
    const participating: Workspace = {
      ...workspace,
      id: 'workspace-2',
      members: workspace.members.map((member) =>
        member.user_id === 'owner-1'
          ? { ...member, role: 'ADMIN' as const }
          : member,
      ),
    }
    const publicOnly: Workspace = {
      ...workspace,
      id: 'workspace-3',
      members: workspace.members.filter(
        (member) => member.user_id !== 'owner-1',
      ),
    }

    expect(
      partitionWorkspacesByOwnership(
        [participating, publicOnly, owned],
        'owner-1',
      ),
    ).toEqual({
      owned: [owned],
      participating: [participating],
    })
  })
})
