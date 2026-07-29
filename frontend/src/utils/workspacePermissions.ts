import type { Workspace, WorkspaceRole } from '../types'

const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
}

export function workspaceRoleFor(
  workspace: Workspace,
  userId: string | undefined,
): WorkspaceRole | null {
  if (!userId) return null
  return (
    workspace.members.find((member) => member.user_id === userId)?.role ?? null
  )
}

export function hasWorkspaceRole(
  role: WorkspaceRole | null,
  minimum: WorkspaceRole,
): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum]
}
