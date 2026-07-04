import { prisma } from "../../db/prisma";
import { ApiError, asyncHandler, roleAtLeast } from "../../utils/http";
import type { Role } from "../../types/express";
import type { Request, Response, NextFunction } from "express";

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: Role;
}

export async function findMembership(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMembership | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { role: true },
  });
  if (!member) return null;
  return { workspaceId, userId, role: member.role as Role };
}

export async function assertWorkspaceMember(
  workspaceId: string,
  userId: string,
  minRole: Role,
): Promise<WorkspaceMembership> {
  const membership = await findMembership(workspaceId, userId);
  if (!membership) {
    throw ApiError.forbidden("Not a member of this workspace");
  }
  if (!roleAtLeast(membership.role, minRole)) {
    throw ApiError.forbidden(
      `Requires ${minRole} role or higher (you are ${membership.role})`,
    );
  }
  return membership;
}

export async function canReadWorkspace(
  workspaceId: string,
  userId: string | undefined,
): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { isPublic: true },
  });
  if (!workspace) {
    throw ApiError.notFound("Workspace not found");
  }
  if (workspace.isPublic) return;
  if (!userId) {
    throw ApiError.unauthorized();
  }
  const membership = await findMembership(workspaceId, userId);
  if (!membership) {
    throw ApiError.forbidden("Not a member of this private workspace");
  }
}

export function requireWorkspaceRole(minRole: Role) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const workspaceId = req.params.workspaceId ?? req.params.workspace_id;
    if (!workspaceId) {
      throw ApiError.badRequest("BAD_REQUEST", "Missing workspace id in route");
    }
    if (!req.user?.id) {
      throw ApiError.unauthorized();
    }
    await assertWorkspaceMember(workspaceId, req.user.id, minRole);
    next();
  });
}
