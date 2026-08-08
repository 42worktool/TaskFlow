import type { Prisma, Role } from '@prisma/client'
import { prisma } from '../db'
import { ForbiddenError, NotFoundError } from '../errors'

export type WorkspacePermissionClient = Pick<Prisma.TransactionClient, 'workspaceMember'>

const ROLE_RANK: Readonly<Record<Role, number>> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
}

// 역할 순위를 한 곳에서 정의해 각 도메인이 서로 다른 권한 계층을 구현하지 않게 한다.

type ReadableWorkspace = {
  is_public: boolean
  members: readonly { user_id: string }[]
}

export function hasMinimumWorkspaceRole(role: Role, minimumRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole]
}

export function workspaceRoleOutranks(role: Role, targetRole: Role): boolean {
  return ROLE_RANK[role] > ROLE_RANK[targetRole]
}

export function requireMinimumWorkspaceRole(role: Role | null, minimumRole: Role): Role {
  if (!role || !hasMinimumWorkspaceRole(role, minimumRole)) {
    throw new ForbiddenError()
  }
  return role
}

export function requireWorkspaceReadAccess<T extends ReadableWorkspace>(
  workspace: T | null,
  userId: string,
): { workspace: T; isMember: boolean } {
  // 공개 워크스페이스는 비회원에게 읽기만 허용하고, 비공개 공간은 활성 멤버만 통과시킨다.
  if (!workspace) throw new NotFoundError()

  const isMember = workspace.members.some((member) => member.user_id === userId)
  if (!workspace.is_public && !isMember) throw new ForbiddenError()

  return { workspace, isMember }
}

export async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
  client: WorkspacePermissionClient = prisma,
): Promise<Role | null> {
  // soft delete된 멤버십이나 워크스페이스는 권한으로 인정하지 않는다.
  const membership = await client.workspaceMember.findFirst({
    where: {
      workspace_id: workspaceId,
      user_id: userId,
      deleted_at: null,
      workspace: { deleted_at: null },
    },
    select: { role: true },
  })
  return membership?.role ?? null
}

export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  minimumRole: Role,
  client: WorkspacePermissionClient = prisma,
): Promise<Role> {
  const role = await getWorkspaceRole(workspaceId, userId, client)
  return requireMinimumWorkspaceRole(role, minimumRole)
}
