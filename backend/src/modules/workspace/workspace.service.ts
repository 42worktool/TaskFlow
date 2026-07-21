import { prisma } from "../../db/prisma";
import { ApiError, roleAtLeast } from "../../utils/http";
import type { Role } from "../../../types/express";
import { createWorkspaceSchema, type CreateWorkspace, type UpdateWorkspace } from "./workspace.schema";

// Constants
const LIST_BLOCK = 65536;
const DEFAULT_LISTS = ["할 일", "진행 중", "완료"];

export async function createWorkspace(data: CreateWorkspace, userId: string) {
  const parsed = createWorkspaceSchema.safeParse(data);
  if (!parsed.success) {
    throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
  }
  const workspace = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      is_public: parsed.data.isPublic ?? false,
    },
  });
  // Create owner membership
  await prisma.workspaceMember.create({
    data: { user_id: userId, workspace_id: workspace.id, role: "OWNER" },
  });
  // Create default lists
  for (let i = 0; i < DEFAULT_LISTS.length; i++) {
    await prisma.list.create({
      data: { workspace_id: workspace.id, name: DEFAULT_LISTS[i], sequence: (i + 1) * LIST_BLOCK },
    });
  }
  return { id: workspace.id, name: workspace.name, is_public: workspace.is_public };
}

export async function getWorkspaces(userId: string) {
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { is_public: true },
        { members: { some: { user_id: userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      is_public: true,
      lists: { select: { id: true, name: true, sequence: true } },
    },
  });
  return workspaces;
}

export async function getWorkspace(workspaceId: string, userId?: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      is_public: true,
      lists: { select: { id: true, name: true, sequence: true } },
      members: { select: { user_id: true, role: true } },
    },
  });
  if (!workspace) throw ApiError.notFound("Workspace not found");
  if (!workspace.is_public && !userId) throw ApiError.unauthorized();
  if (!workspace.is_public && userId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { user_id_workspace_id: { user_id: userId, workspace_id: workspaceId } },
    });
    if (!membership) throw ApiError.forbidden("Not a member of this workspace");
  }
  return workspace;
}

export async function updateWorkspace(workspaceId: string, data: UpdateWorkspace, _userId: string, userRole: Role) {
  if (!roleAtLeast(userRole, "ADMIN")) {
    throw ApiError.forbidden("ADMIN role or higher required");
  }
  const parsed = createWorkspaceSchema.partial().safeParse(data);
  if (!parsed.success) {
    throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
  }
  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      name: parsed.data.name,
      is_public: parsed.data.isPublic,
    },
  });
  return { id: workspace.id, name: workspace.name, is_public: workspace.is_public };
}

export async function deleteWorkspace(workspaceId: string, _userId: string, userRole: Role) {
  if (userRole !== "OWNER") {
    throw ApiError.forbidden("Only OWNER can delete workspace");
  }
  await prisma.workspace.delete({ where: { id: workspaceId } });
  // Lists/Cards/Labels cascade via schema onDelete: Cascade
  return { ok: true };
}

export async function inviteMember(workspaceId: string, email: string, role: Role, inviterRole: Role) {
  if (!roleAtLeast(inviterRole, "ADMIN")) {
    throw ApiError.forbidden("ADMIN role or higher required to invite");
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw ApiError.badRequest("USER_NOT_FOUND", "No user with this email");
  try {
    await prisma.workspaceMember.create({
      data: { user_id: user.id, workspace_id: workspaceId, role },
    });
  } catch {
    throw ApiError.badRequest("ALREADY_MEMBER", "User already member");
  }
  return { userId: user.id, role };
}

export async function updateMember(workspaceId: string, targetUserId: string, newRole: Role, actorRole: Role) {
  if (!roleAtLeast(actorRole, "ADMIN")) {
    throw ApiError.forbidden("ADMIN role or higher required");
  }
  const member = await prisma.workspaceMember.findUnique({
    where: { user_id_workspace_id: { user_id: targetUserId, workspace_id: workspaceId } },
  });
  if (!member) throw ApiError.notFound("Member not found");
  // Cannot change OWNER
  if (member.role === "OWNER") {
    throw ApiError.badRequest("CANNOT_CHANGE_OWNER", "Cannot change OWNER role");
  }
  const updated = await prisma.workspaceMember.update({
    where: { user_id_workspace_id: { user_id: targetUserId, workspace_id: workspaceId } },
    data: { role: newRole },
  });
  return { userId: targetUserId, role: updated.role };
}

export async function removeMember(workspaceId: string, targetUserId: string, actorRole: Role) {
  if (!roleAtLeast(actorRole, "ADMIN")) {
    throw ApiError.forbidden("ADMIN role or higher required");
  }
  const member = await prisma.workspaceMember.findUnique({
    where: { user_id_workspace_id: { user_id: targetUserId, workspace_id: workspaceId } },
  });
  if (!member) throw ApiError.notFound("Member not found");
  if (member.role === "OWNER") {
    throw ApiError.badRequest("CANNOT_REMOVE_OWNER", "Cannot remove OWNER");
  }
  await prisma.workspaceMember.delete({
    where: { user_id_workspace_id: { user_id: targetUserId, workspace_id: workspaceId } },
  });
  return { ok: true };
}