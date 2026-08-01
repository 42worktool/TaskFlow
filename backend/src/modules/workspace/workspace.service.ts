// ============================================================
// workspace.service.ts — Workspace CRUD business logic
//
// All functions operate on the Prisma client singleton (../db.ts).
// Authorization checks are done here; the controller only handles
// HTTP concerns (parsing, validation, status codes).
// ============================================================
import jwt from 'jsonwebtoken'
import { prisma } from '../../db'
import { config } from '../../config'
import { AppError, ForbiddenError, NotFoundError } from '../../errors'
import type { Prisma, WorkspaceMember, Role } from '@prisma/client'
import { createdBy, restoredBy, softDeletedBy, updatedBy } from '../../lib/audit'
import {
  requireMinimumWorkspaceRole,
  requireWorkspaceReadAccess,
  requireWorkspaceRole,
} from '../../lib/workspace-permissions'
import { checkMailRateLimit } from '../../lib/mail-rate-limiter'
import { enqueue } from '../../lib/mail-queue'
import { inviteEmail } from '../../lib/mail-templates'
import { normalizeEmail } from '../../lib/validation'
import { notifyWorkspaceMemberJoined } from '../notification/notification.service'
import { isUserOnline } from '../presence/presence.state'
import { realtime } from '../../realtime'
import { toWorkspaceDto, workspaceInclude } from './workspace.dto'
import {
  publishWorkspaceChange,
  publishWorkspacePresenceChanged,
  revokeWorkspaceAccess,
  revokeWorkspaceMemberAccess,
  workspaceChannel,
} from './workspace.realtime'

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60
const WORKSPACE_INVITE_AUDIENCE = 'workspace-invite'
const INVITE_ROLES = new Set<Role>(['ADMIN', 'MEMBER', 'VIEWER'])

interface InvitePayload {
  workspace_id: string
  role: Role
  email: string
}

class InviteTokenError extends AppError {
  constructor() {
    super('INVITE_TOKEN_INVALID', 400, 'invalid or expired invite token')
  }
}

class InviteEmailMismatchError extends AppError {
  constructor() {
    super(
      'INVITE_EMAIL_MISMATCH',
      403,
      'this invitation was sent to another email address',
    )
  }
}

async function requireManagedWorkspace(
  tx: Prisma.TransactionClient,
  wsId: string,
  callerId: string,
  minRole: Role,
) {
  const workspace = await tx.workspace.findFirst({
    where: { id: wsId, deleted_at: null },
    include: { members: { where: { deleted_at: null } } },
  })
  if (!workspace) throw new NotFoundError()

  const callerRole = workspace.members.find((member) => member.user_id === callerId)?.role
  requireMinimumWorkspaceRole(callerRole ?? null, minRole)
  return workspace
}

function requireRoleChangeAllowed(
  targetMembership: WorkspaceMember,
  newRole: Role,
): void {
  if (
    targetMembership.role === 'OWNER' ||
    newRole === 'OWNER'
  ) {
    throw new ForbiddenError()
  }
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
export async function listWorkspaces(input: { userId: string }) {
  const [my, public_] = await Promise.all([
    prisma.workspace.findMany({
      where: {
        deleted_at: null,
        members: { some: { user_id: input.userId, deleted_at: null } },
      },
      include: workspaceInclude,
      orderBy: { created_at: 'desc' },
    }),
    prisma.workspace.findMany({
      where: {
        deleted_at: null,
        is_public: true,
        members: { none: { user_id: input.userId, deleted_at: null } },
      },
      include: workspaceInclude,
      orderBy: { created_at: 'desc' },
    }),
  ])

  return {
    my: my.map((workspace) =>
      toWorkspaceDto(workspace, { includeMemberEmail: true }),
    ),
    public: public_.map((workspace) =>
      toWorkspaceDto(workspace, { includeMemberEmail: false }),
    ),
  }
}

/**
 * Get a single workspace by ID.
 * Accessible if the user is a member OR the workspace is public.
 */
export async function getWorkspace(input: { userId: string; workspaceId: string }) {
  const ws = await prisma.workspace.findFirst({
    where: { id: input.workspaceId, deleted_at: null },
    include: workspaceInclude,
  })

  const { workspace, isMember } = requireWorkspaceReadAccess(ws, input.userId)

  return toWorkspaceDto(workspace, { includeMemberEmail: isMember })
}

/**
 * Create a workspace and register the creator as OWNER in a single transaction.
 */
export async function createWorkspace(input: {
  userId: string
  name: string
  isPublic: boolean
}) {
  const workspace = await prisma.workspace.create({
    data: {
      name: input.name,
      is_public: input.isPublic,
      ...createdBy(input.userId),
      members: {
        create: {
          user_id: input.userId,
          role: 'OWNER',
          ...createdBy(input.userId),
        },
      },
    },
    include: workspaceInclude,
  })

  return toWorkspaceDto(workspace, { includeMemberEmail: true })
}

/**
 * Partial update (name / is_public). Requires ADMIN or above.
 */
export async function updateWorkspace(
  input: {
    userId: string
    workspaceId: string
    name?: string
    isPublic?: boolean
  },
) {
  const workspace = await prisma.$transaction(async (tx) => {
    await requireManagedWorkspace(tx, input.workspaceId, input.userId, 'ADMIN')

    const updated = await tx.workspace.update({
      where: { id: input.workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...('isPublic' in input ? { is_public: input.isPublic } : {}),
        ...updatedBy(input.userId),
      },
      include: workspaceInclude,
    })

    return toWorkspaceDto(updated, { includeMemberEmail: true })
  })

  publishWorkspaceChange({
    workspace_id: input.workspaceId,
    entity: 'workspace',
    action: 'updated',
    entity_id: input.workspaceId,
    list_ids: [],
    actor_user_id: input.userId,
  })
  return workspace
}

/**
 * Soft-delete a workspace. Child rows stay intact for auditability and are
 * hidden by active-workspace filters. Requires OWNER.
 */
export async function deleteWorkspace(input: { userId: string; workspaceId: string }) {
  await prisma.$transaction(async (tx) => {
    await requireManagedWorkspace(tx, input.workspaceId, input.userId, 'OWNER')

    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: softDeletedBy(input.userId),
    })
  })

  revokeWorkspaceAccess(input.workspaceId)
  publishWorkspaceChange({
    workspace_id: input.workspaceId,
    entity: 'workspace',
    action: 'deleted',
    entity_id: input.workspaceId,
    list_ids: [],
    actor_user_id: input.userId,
  })
  realtime.clearChannel(workspaceChannel(input.workspaceId))
}

/**
 * Change a member's role. Caller must be ADMIN+.
 * OWNER membership is intentionally immutable here: ownership transfer is a
 * separate workflow, not an ordinary member-role update.
 */
export async function changeMemberRole(
  input: {
    userId: string
    workspaceId: string
    targetUserId: string
    role: Role
  },
) {
  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await requireManagedWorkspace(
      tx,
      input.workspaceId,
      input.userId,
      'ADMIN',
    )

    const targetMembership = ws.members.find(
      (member) => member.user_id === input.targetUserId,
    )
    if (!targetMembership) throw new NotFoundError()

    requireRoleChangeAllowed(
      targetMembership,
      input.role,
    )

    await tx.workspaceMember.update({
      where: {
        workspace_id_user_id: {
          workspace_id: input.workspaceId,
          user_id: input.targetUserId,
        },
      },
      data: {
        role: input.role,
        ...updatedBy(input.userId),
      },
    })

    const updated = await tx.workspace.findFirst({
      where: { id: input.workspaceId, deleted_at: null },
      include: workspaceInclude,
    })

    return toWorkspaceDto(updated!, { includeMemberEmail: true })
  })

  publishWorkspaceChange({
    workspace_id: input.workspaceId,
    entity: 'member',
    action: 'updated',
    entity_id: input.targetUserId,
    list_ids: [],
    actor_user_id: input.userId,
  })
  return workspace
}

/**
 * Remove a member from the workspace. Caller must be ADMIN+.
 * ADMIN and OWNER memberships cannot be removed.
 */
export async function removeMember(input: {
  userId: string
  workspaceId: string
  targetUserId: string
}) {
  await prisma.$transaction(async (tx) => {
    const ws = await requireManagedWorkspace(
      tx,
      input.workspaceId,
      input.userId,
      'ADMIN',
    )

    const targetMembership = ws.members.find(
      (member) => member.user_id === input.targetUserId,
    )
    if (!targetMembership) throw new NotFoundError()

    if (
      targetMembership.role === 'ADMIN' ||
      targetMembership.role === 'OWNER'
    ) {
      throw new ForbiddenError()
    }

    await tx.workspaceMember.update({
      where: {
        workspace_id_user_id: {
          workspace_id: input.workspaceId,
          user_id: input.targetUserId,
        },
      },
      data: softDeletedBy(input.userId),
    })
  })

  revokeWorkspaceMemberAccess(input.workspaceId, input.targetUserId)
  publishWorkspaceChange({
    workspace_id: input.workspaceId,
    entity: 'member',
    action: 'deleted',
    entity_id: input.targetUserId,
    list_ids: [],
    actor_user_id: input.userId,
  })
  realtime.leaveUserChannel(
    input.targetUserId,
    workspaceChannel(input.workspaceId),
  )
}

/**
 * Generate a signed invite token. The caller sends this link by email.
 */
export function generateInviteToken(
  workspaceId: string,
  role: Exclude<Role, 'OWNER'>,
  email: string,
): string {
  return jwt.sign(
    { workspace_id: workspaceId, role, email },
    config.jwtAccessSecret,
    {
      algorithm: 'HS256',
      issuer: config.jwtIssuer,
      audience: WORKSPACE_INVITE_AUDIENCE,
      expiresIn: INVITE_TTL_SECONDS,
    },
  )
}

function verifyInviteToken(token: string): InvitePayload {
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: WORKSPACE_INVITE_AUDIENCE,
    })
    if (
      typeof payload !== 'object' ||
      typeof payload.workspace_id !== 'string' ||
      typeof payload.email !== 'string' ||
      !INVITE_ROLES.has(payload.role as Role)
    ) {
      throw new InviteTokenError()
    }
    return {
      workspace_id: payload.workspace_id,
      role: payload.role as Role,
      email: normalizeEmail(payload.email),
    }
  } catch (error) {
    if (error instanceof InviteTokenError) throw error
    throw new InviteTokenError()
  }
}

export async function inviteWorkspaceMember(input: {
  userId: string
  workspaceId: string
  email: string
  role: Exclude<Role, 'OWNER'>
}): Promise<void> {
  const email = normalizeEmail(input.email)
  const workspace = await getWorkspace({
    userId: input.userId,
    workspaceId: input.workspaceId,
  })
  await requireWorkspaceRole(input.workspaceId, input.userId, 'ADMIN')

  const token = generateInviteToken(
    input.workspaceId,
    input.role,
    email,
  )
  const inviteUrl = `${config.appOrigin}/invite/${token}`

  await checkMailRateLimit(email)
  await enqueue({
    to: email,
    ...inviteEmail(workspace.name, inviteUrl),
  })
}

/**
 * Accept an invite: verify the token and add the user as a member.
 * Returns the workspace DTO on success.
 */
export async function acceptInvite(input: { userId: string; token: string }) {
  const payload = verifyInviteToken(input.token)
  const invitee = await prisma.user.findFirst({
    where: { id: input.userId, deleted_at: null },
    select: { email: true, name: true, profile_image_url: true },
  })
  if (!invitee || normalizeEmail(invitee.email) !== payload.email) {
    throw new InviteEmailMismatchError()
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: payload.workspace_id, deleted_at: null },
    include: workspaceInclude,
  })

  if (!ws) throw new InviteTokenError()

  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspace_id_user_id: {
        workspace_id: payload.workspace_id,
        user_id: input.userId,
      },
    },
  })

  if (existing?.deleted_at === null) {
    return toWorkspaceDto(ws, { includeMemberEmail: true })
  }

  if (existing) {
    await prisma.workspaceMember.update({
      where: {
        workspace_id_user_id: {
          workspace_id: payload.workspace_id,
          user_id: input.userId,
        },
      },
      data: { role: payload.role, ...restoredBy(input.userId) },
    })
  } else {
    await prisma.workspaceMember.create({
      data: {
        workspace_id: payload.workspace_id,
        user_id: input.userId,
        role: payload.role,
        ...createdBy(input.userId),
      },
    })
  }

  const updated = await prisma.workspace.findFirst({
    where: { id: payload.workspace_id, deleted_at: null },
    include: workspaceInclude,
  })

  notifyWorkspaceMemberJoined({
    recipientUserIds: ws.members.map((member) => member.user_id),
    workspaceId: ws.id,
    workspaceName: ws.name,
    actor: {
      userId: input.userId,
      name: invitee.name,
      profileImageUrl: invitee.profile_image_url,
    },
  })

  publishWorkspaceChange({
    workspace_id: payload.workspace_id,
    entity: 'member',
    action: 'created',
    entity_id: input.userId,
    list_ids: [],
    actor_user_id: input.userId,
  })
  if (isUserOnline(input.userId)) {
    publishWorkspacePresenceChanged({
      workspace_id: payload.workspace_id,
      user_id: input.userId,
      online: true,
    })
  }

  return toWorkspaceDto(updated!, { includeMemberEmail: true })
}
