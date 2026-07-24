// ============================================================
// workspace.service.ts — Workspace CRUD business logic
//
// All functions operate on the Prisma client singleton (../db.ts).
// Authorization checks are done here; the controller only handles
// HTTP concerns (parsing, validation, status codes).
// ============================================================
import { prisma } from '../../db'
import type { Workspace, WorkspaceMember, User, Role } from '@prisma/client'

// ------------------------------------------------------------
// Error classes — the controller maps these to HTTP status codes
// ------------------------------------------------------------
export class ForbiddenError extends Error {
  code = 'FORBIDDEN' as const

  constructor(message = 'forbidden') {
    super(message)
  }
}
export class NotFoundError extends Error {
  code = 'NOT_FOUND' as const

  constructor(message = 'not found') {
    super(message)
  }
}
export class BadRequestError extends Error {
  code = 'BAD_REQUEST' as const

  constructor(message = 'bad request') {
    super(message)
  }
}

// ------------------------------------------------------------
// Role helpers
// ------------------------------------------------------------
const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
}

async function getRole(wsId: string, userId: string): Promise<Role | null> {
  const m = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: wsId, user_id: userId } },
  })
  return m?.role ?? null
}

/** Throw ForbiddenError if the user's role is below the required minimum. */
async function requireRole(wsId: string, userId: string, minRole: Role): Promise<void> {
  const role = await getRole(wsId, userId)
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError()
  }
}

// ------------------------------------------------------------
// Response shape used by every function that returns a workspace
// ------------------------------------------------------------
const workspaceInclude = {
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          profile_image_url: true,
        },
      },
    },
  },
} as const

type WorkspaceWithMembers = Workspace & {
  members: (WorkspaceMember & {
    user: Pick<User, 'id' | 'name' | 'email' | 'profile_image_url'>
  })[]
}

type WorkspaceMemberWithUser = WorkspaceMember & {
  user: Pick<User, 'id' | 'name' | 'email' | 'profile_image_url'>
}

// ============================================================
// Public API
// ============================================================

/**
 * List workspaces the user can see.
 * Returns two groups:
 *   my    — workspaces where the user is a member (private + public)
 *   public — public workspaces the user has NOT joined
 */
export async function listWorkspaces(userId: string) {
  const [my, public_] = await Promise.all([
    prisma.workspace.findMany({
      where: { members: { some: { user_id: userId } } },
      include: workspaceInclude,
      orderBy: { created_at: 'desc' },
    }),
    prisma.workspace.findMany({
      where: {
        is_public: true,
        members: { none: { user_id: userId } },
      },
      include: workspaceInclude,
      orderBy: { created_at: 'desc' },
    }),
  ])

  return {
    my: my.map(toDTO),
    public: public_.map(toDTO),
  }
}

/**
 * Get a single workspace by ID.
 * Accessible if the user is a member OR the workspace is public.
 */
export async function getWorkspace(userId: string, wsId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: wsId },
    include: workspaceInclude,
  })

  if (!ws) throw new NotFoundError()

  const isMember = ws.members.some((m) => m.user_id === userId)
  if (!isMember && !ws.is_public) throw new ForbiddenError()

  return toDTO(ws)
}

/**
 * Invite (add) a member by email. Requires ADMIN or above.
 */
export async function inviteMember(
  userId: string,
  wsId: string,
  email: string,
  role: Role = 'MEMBER',
) {
  await requireRole(wsId, userId, 'ADMIN')

  const ws = await prisma.workspace.findUnique({ where: { id: wsId } })
  if (!ws) throw new NotFoundError('workspace not found')

  const invitedUser = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  })
  if (!invitedUser) throw new NotFoundError('user not found')

  const member = await prisma.workspaceMember.upsert({
    where: {
      workspace_id_user_id: {
        workspace_id: wsId,
        user_id: invitedUser.id,
      },
    },
    create: {
      workspace_id: wsId,
      user_id: invitedUser.id,
      role,
    },
    update: {
      role,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          profile_image_url: true,
        },
      },
    },
  })

  return toMemberDTO(member)
}

/**
 * Create a workspace and register the creator as OWNER in a single transaction.
 */
export async function createWorkspace(userId: string, name: string, isPublic: boolean) {
  const ws = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: {
        name,
        is_public: isPublic,
        members: {
          create: { user_id: userId, role: 'OWNER' },
        },
      },
      include: workspaceInclude,
    })
    return created
  })

  return toDTO(ws)
}

/**
 * Partial update (name / is_public). Requires ADMIN or above.
 */
export async function updateWorkspace(
  userId: string,
  wsId: string,
  data: { name?: string; is_public?: boolean },
) {
  const ws = await prisma.workspace.findUnique({ where: { id: wsId } })
  if (!ws) throw new NotFoundError()

  await requireRole(wsId, userId, 'ADMIN')

  const updated = await prisma.workspace.update({
    where: { id: wsId },
    data,
    include: workspaceInclude,
  })

  return toDTO(updated)
}

/**
 * Delete a workspace (cascade deletes lists, cards, labels, memberships).
 * Requires OWNER.
 */
export async function deleteWorkspace(userId: string, wsId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: wsId } })
  if (!ws) throw new NotFoundError()

  await requireRole(wsId, userId, 'OWNER')

  await prisma.workspace.delete({ where: { id: wsId } })
}

/**
 * Change a workspace member's role. Requires ADMIN or above.
 * Demoting the final OWNER is blocked.
 */
export async function updateWorkspaceMemberRole(
  userId: string,
  wsId: string,
  targetUserId: string,
  role: Role,
) {
  await requireRole(wsId, userId, 'ADMIN')

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspace_id_user_id: {
        workspace_id: wsId,
        user_id: targetUserId,
      },
    },
  })
  if (!member) throw new NotFoundError('member not found')

  if (member.role === 'OWNER' && role !== 'OWNER') {
    await ensureNotLastOwner(wsId, 'cannot demote the last owner')
  }

  const updated = await prisma.workspaceMember.update({
    where: {
      workspace_id_user_id: {
        workspace_id: wsId,
        user_id: targetUserId,
      },
    },
    data: { role },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          profile_image_url: true,
        },
      },
    },
  })

  return toMemberDTO(updated)
}

/**
 * Remove a workspace member. Requires ADMIN or above.
 * Removing the final OWNER is blocked.
 */
export async function removeWorkspaceMember(userId: string, wsId: string, targetUserId: string) {
  await requireRole(wsId, userId, 'ADMIN')

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspace_id_user_id: {
        workspace_id: wsId,
        user_id: targetUserId,
      },
    },
  })
  if (!member) throw new NotFoundError('member not found')

  if (member.role === 'OWNER') {
    await ensureNotLastOwner(wsId, 'cannot remove the last owner')
  }

  await prisma.workspaceMember.delete({
    where: {
      workspace_id_user_id: {
        workspace_id: wsId,
        user_id: targetUserId,
      },
    },
  })
}

// ============================================================
// DTO conversion — Prisma (camelCase) → API response (snake_case)
// ============================================================
function toDTO(ws: WorkspaceWithMembers) {
  return {
    id: ws.id,
    name: ws.name,
    is_public: ws.is_public,
    created_at: ws.created_at.toISOString(),
    updated_at: ws.updated_at.toISOString(),
    members: ws.members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        profile_image_url: m.user.profile_image_url,
      },
    })),
  }
}

function toMemberDTO(member: WorkspaceMemberWithUser) {
  return {
    user_id: member.user_id,
    role: member.role,
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      profile_image_url: member.user.profile_image_url,
    },
  }
}

async function ensureNotLastOwner(wsId: string, message: string): Promise<void> {
  const ownerCount = await prisma.workspaceMember.count({
    where: {
      workspace_id: wsId,
      role: 'OWNER',
    },
  })

  if (ownerCount === 1) {
    throw new BadRequestError(message)
  }
}
