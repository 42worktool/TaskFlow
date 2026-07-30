import type { Prisma, Role } from '@prisma/client'
import { prisma } from '../db'
import { ForbiddenError } from '../errors'

export type WorkspacePermissionClient = Pick<
  Prisma.TransactionClient,
  'workspaceMember'
>

const ROLE_RANK: Readonly<Record<Role, number>> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
}

export function hasMinimumWorkspaceRole(
  role: Role,
  minimumRole: Role,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole]
}

export async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
  client: WorkspacePermissionClient = prisma,
): Promise<Role | null> {
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
  if (!role || !hasMinimumWorkspaceRole(role, minimumRole)) {
    throw new ForbiddenError()
  }
  return role
}
