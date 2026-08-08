// 워크스페이스 역할 위계를 화면 노출 판단에 재사용하는 순수 함수 모음이다.
// 보안을 보장하는 최종 권한 검사는 서버가 수행하며, 여기서는 불가능한 조작을 미리 숨긴다.
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
  return workspace.members.find((member) => member.user_id === userId)?.role ?? null
}

export function hasWorkspaceRole(role: WorkspaceRole | null, minimum: WorkspaceRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum]
}

export function canChangeWorkspaceMemberRole(
  callerRole: WorkspaceRole | null,
  targetRole: WorkspaceRole,
): boolean {
  // 관리자도 동급 이상과 OWNER는 제어하지 못하고 자신보다 낮은 역할만 바꿀 수 있다.
  return (
    callerRole !== null &&
    ROLE_RANK[callerRole] >= ROLE_RANK.ADMIN &&
    targetRole !== 'OWNER' &&
    ROLE_RANK[targetRole] < ROLE_RANK[callerRole]
  )
}

export function canAssignWorkspaceRole(
  callerRole: WorkspaceRole | null,
  role: WorkspaceRole,
): boolean {
  return (
    callerRole !== null &&
    ROLE_RANK[callerRole] >= ROLE_RANK.ADMIN &&
    ROLE_RANK[role] < ROLE_RANK[callerRole]
  )
}

export function partitionWorkspacesByOwnership(
  workspaces: readonly Workspace[],
  userId: string | undefined,
): { owned: Workspace[]; participating: Workspace[] } {
  // 첫 화면에서 내가 만든 프로젝트와 참여 중인 프로젝트를 역할 기준으로 분리한다.
  const owned: Workspace[] = []
  const participating: Workspace[] = []

  for (const workspace of workspaces) {
    const role = workspaceRoleFor(workspace, userId)
    if (role === 'OWNER') owned.push(workspace)
    else if (role !== null) participating.push(workspace)
  }

  return { owned, participating }
}
