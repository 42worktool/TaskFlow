// ============================================================
// workspace.service.ts — Workspace CRUD business logic
//
// All functions operate on the Prisma client singleton (../db.ts).
// Authorization checks are done here; the controller only handles
// HTTP concerns (parsing, validation, status codes).
// ============================================================
import { prisma } from '../../db'
import { config } from '../../config'
import { AppError, NotFoundError } from '../../errors'
import type { Prisma, WorkspaceMember, Role } from '@prisma/client'
import { createdBy, restoredBy, softDeletedBy, updatedBy } from '../../lib/audit'
import {
  requireMinimumWorkspaceRole,
  requireWorkspaceReadAccess,
  requireWorkspaceRole,
  workspaceRoleOutranks,
} from '../../lib/workspace-permissions'
import { checkMailRateLimit } from '../../lib/mail-rate-limiter'
import { enqueue } from '../../lib/mail-queue'
import { inviteEmail } from '../../lib/mail-templates'
import { normalizeEmail } from '../../lib/validation'
import { KeyedLock } from '../../lib/keyed-lock'
import { workspaceInvitationStore } from './workspace-invitation.store'
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

class InviteTokenError extends AppError {
  constructor() {
    super('INVITE_TOKEN_INVALID', 400, 'invalid or expired invite token')
  }
}

class WorkspaceRoleHierarchyError extends AppError {
  constructor() {
    super('WORKSPACE_ROLE_HIERARCHY', 403, 'you can manage and assign only roles below your own')
  }
}

class WorkspaceOwnershipTransferRequiredError extends AppError {
  constructor() {
    super(
      'WORKSPACE_OWNERSHIP_TRANSFER_REQUIRED',
      409,
      'transfer ownership before leaving this workspace',
    )
  }
}

class WorkspaceHasOtherMembersError extends AppError {
  constructor() {
    super(
      'WORKSPACE_HAS_OTHER_MEMBERS',
      409,
      'remove the other members or transfer ownership instead of deleting this workspace',
    )
  }
}

const workspaceMutationLock = new KeyedLock()

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
  callerRole: Role,
  targetMembership: WorkspaceMember,
  newRole: Role,
): void {
  if (
    !workspaceRoleOutranks(callerRole, targetMembership.role) ||
    !workspaceRoleOutranks(callerRole, newRole)
  ) {
    throw new WorkspaceRoleHierarchyError()
  }
}

function finalizeWorkspaceDeletion(workspaceId: string, actorUserId: string): void {
  revokeWorkspaceAccess(workspaceId)
  publishWorkspaceChange({
    workspace_id: workspaceId,
    entity: 'workspace',
    action: 'deleted',
    entity_id: workspaceId,
    list_ids: [],
    actor_user_id: actorUserId,
  })
  realtime.clearChannel(workspaceChannel(workspaceId))
}

function finalizeMemberRemoval(
  workspaceId: string,
  targetUserId: string,
  actorUserId: string,
): void {
  revokeWorkspaceMemberAccess(workspaceId, targetUserId)
  publishWorkspaceChange({
    workspace_id: workspaceId,
    entity: 'member',
    action: 'deleted',
    entity_id: targetUserId,
    list_ids: [],
    actor_user_id: actorUserId,
  })
  realtime.leaveUserChannel(targetUserId, workspaceChannel(workspaceId))
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
    my: my.map((workspace) => toWorkspaceDto(workspace, { includeMemberEmail: true })),
    public: public_.map((workspace) => toWorkspaceDto(workspace, { includeMemberEmail: false })),
  }
}

type WorkspaceWithMembers = Prisma.WorkspaceGetPayload<{ include: typeof workspaceInclude }>

/**
 * Runs `operation` inside a transaction holding a Postgres advisory lock
 * scoped to the (workspace_id, user_id) pair, serializing every concurrent
 * membership-transition attempt for that pair — whether they're racing to
 * create, restore, or (for the public-join path) re-check the workspace's
 * live state — before any of them reads or writes anything.
 *
 * A row lock (`SELECT ... FOR UPDATE`) can't do this on its own: there's no
 * row to lock until one side commits a brand-new membership, so two
 * concurrent callers could both see no row and both attempt `create`,
 * failing the second on the unique (workspace_id, user_id) constraint.
 */
async function lockMembershipPair<T>(
  workspaceId: string,
  userId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock returns PostgreSQL `void`, which Prisma cannot
    // deserialize through $queryRaw (P2010). This is an effect-only statement,
    // so execute it without asking Prisma to decode a result row.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}), hashtext(${userId}))`
    return operation(tx)
  })
}

/**
 * Restore a soft-deleted membership or create a fresh one. WorkspaceMember's
 * PK is (workspace_id, user_id), so a prior removal must be restored rather
 * than re-created. Assumes the caller already holds the pair's advisory
 * lock (see lockMembershipPair) — this only does the read-then-write, not
 * the locking.
 *
 * Returns whether the membership actually transitioned from inactive
 * (absent or soft-deleted) to active, so callers emit a join notification
 * exactly once instead of once per racing request.
 */
async function writeActiveMembership(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  role: Role,
): Promise<boolean> {
  const existing = await tx.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
  })
  const wasInactive = !existing || existing.deleted_at !== null

  if (existing) {
    await tx.workspaceMember.update({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
      data: { role, ...restoredBy(userId) },
    })
  } else {
    await tx.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: userId, role, ...createdBy(userId) },
    })
  }

  return wasInactive
}

/** Notification + realtime fan-out after a membership is created/restored. */
function announceMemberJoined(
  workspace: { id: string; name: string; members: { user_id: string }[] },
  actor: { userId: string; name: string; profileImageUrl: string | null },
): void {
  notifyWorkspaceMemberJoined({
    recipientUserIds: workspace.members.map((member) => member.user_id),
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    actor,
  })

  publishWorkspaceChange({
    workspace_id: workspace.id,
    entity: 'member',
    action: 'created',
    entity_id: actor.userId,
    list_ids: [],
    actor_user_id: actor.userId,
  })
  if (isUserOnline(actor.userId)) {
    publishWorkspacePresenceChanged({
      workspace_id: workspace.id,
      user_id: actor.userId,
      online: true,
    })
  }
}

/**
 * Row-locks the workspace so a concurrent `updateWorkspace` (is_public
 * toggle) or `deleteWorkspace` can't land between this check and the
 * membership write below. Both of those do a plain `tx.workspace.update`,
 * which Postgres already gives an exclusive row lock for the duration of
 * their transaction — `FOR UPDATE` here requests that same lock, so
 * whichever transaction gets there first makes the other wait, instead of
 * both reading a snapshot that's stale by the time either one writes.
 *
 * Unlike the (workspace_id, user_id) membership pair (see
 * lockMembershipPair), the workspace row is known to already exist by the
 * time this runs, so a plain row lock — not an advisory one — is enough.
 */
async function lockWorkspaceRow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Workspaces"
    WHERE "id" = ${workspaceId}::uuid AND "deleted_at" IS NULL
    FOR UPDATE
  `
  return rows.length > 0
}

/**
 * First visit to a public workspace by a non-member auto-provisions a VIEWER
 * membership. The initial `is_public`/membership check the caller made to
 * decide whether to call this is a separate read from the write below, so
 * by the time the lock is held, the workspace may have been made private or
 * deleted out from under it — re-checks its live state inside the same
 * locked transaction as the write, instead of trusting that stale snapshot,
 * and returns the current row (or null, if it's gone) so the caller never
 * has to re-fetch-and-assume-non-null afterward.
 */
async function joinPublicWorkspaceAsViewer(
  workspaceId: string,
  userId: string,
): Promise<{ workspace: WorkspaceWithMembers | null; joined: boolean }> {
  return lockMembershipPair(workspaceId, userId, async (tx) => {
    if (!(await lockWorkspaceRow(tx, workspaceId))) return { workspace: null, joined: false }

    const workspace = await tx.workspace.findFirst({
      where: { id: workspaceId, deleted_at: null },
      include: workspaceInclude,
    })
    if (!workspace) return { workspace: null, joined: false }

    const isMember = workspace.members.some((member) => member.user_id === userId)
    if (!workspace.is_public || isMember) {
      // Went private, or was joined some other way, while we waited for the
      // lock — nothing to do; let the caller re-evaluate access itself.
      return { workspace, joined: false }
    }

    const wasInactive = await writeActiveMembership(tx, workspaceId, userId, 'VIEWER')
    if (!wasInactive) return { workspace, joined: false }

    const refreshed = await tx.workspace.findFirst({
      where: { id: workspaceId, deleted_at: null },
      include: workspaceInclude,
    })
    return { workspace: refreshed, joined: true }
  })
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

  if (!workspace.is_public || isMember) {
    return toWorkspaceDto(workspace, { includeMemberEmail: isMember })
  }

  const result = await joinPublicWorkspaceAsViewer(workspace.id, input.userId)
  // Re-validate against the fresh, lock-consistent state rather than the
  // snapshot above: requireWorkspaceReadAccess throws NotFoundError if the
  // workspace was deleted, or ForbiddenError if it turned private and this
  // user still isn't a member.
  const fresh = requireWorkspaceReadAccess(result.workspace, input.userId)

  if (result.joined) {
    const joiner = await prisma.user.findFirst({
      where: { id: input.userId, deleted_at: null },
      select: { name: true, profile_image_url: true },
    })
    if (joiner) {
      announceMemberJoined(fresh.workspace, {
        userId: input.userId,
        name: joiner.name,
        profileImageUrl: joiner.profile_image_url,
      })
    }
  }

  return toWorkspaceDto(fresh.workspace, { includeMemberEmail: fresh.isMember })
}

/**
 * Create a workspace and register the creator as OWNER in a single transaction.
 */
export async function createWorkspace(input: { userId: string; name: string; isPublic: boolean }) {
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
export async function updateWorkspace(input: {
  userId: string
  workspaceId: string
  name?: string
  isPublic?: boolean
}) {
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
  await workspaceMutationLock.run(input.workspaceId, async () => {
    await prisma.$transaction(async (tx) => {
      const workspace = await requireManagedWorkspace(tx, input.workspaceId, input.userId, 'OWNER')
      if (workspace.members.some((member) => member.user_id !== input.userId)) {
        throw new WorkspaceHasOtherMembersError()
      }

      await tx.workspace.update({
        where: { id: input.workspaceId },
        data: softDeletedBy(input.userId),
      })
    })

    await workspaceInvitationStore.discardWorkspace(input.workspaceId)
  })

  finalizeWorkspaceDeletion(input.workspaceId, input.userId)
}

/**
 * Transfer the single OWNER position to an active member. The previous owner
 * stays in the workspace as ADMIN and may leave through the normal flow.
 */
export async function transferWorkspaceOwnership(input: {
  userId: string
  workspaceId: string
  targetUserId: string
}) {
  const workspace = await workspaceMutationLock.run(input.workspaceId, () =>
    prisma.$transaction(async (tx) => {
      const ws = await requireManagedWorkspace(tx, input.workspaceId, input.userId, 'OWNER')
      const targetMembership = ws.members.find((member) => member.user_id === input.targetUserId)
      if (!targetMembership) throw new NotFoundError()
      if (targetMembership.user_id === input.userId || targetMembership.role === 'OWNER') {
        throw new WorkspaceRoleHierarchyError()
      }

      await tx.workspaceMember.update({
        where: {
          workspace_id_user_id: {
            workspace_id: input.workspaceId,
            user_id: input.userId,
          },
        },
        data: { role: 'ADMIN', ...updatedBy(input.userId) },
      })
      await tx.workspaceMember.update({
        where: {
          workspace_id_user_id: {
            workspace_id: input.workspaceId,
            user_id: input.targetUserId,
          },
        },
        data: { role: 'OWNER', ...updatedBy(input.userId) },
      })

      const updated = await tx.workspace.findFirst({
        where: { id: input.workspaceId, deleted_at: null },
        include: workspaceInclude,
      })
      return toWorkspaceDto(updated!, { includeMemberEmail: true })
    }),
  )

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
 * Leave a workspace. A sole OWNER leaves by deleting the now-empty workspace;
 * an OWNER with other active members must transfer ownership first.
 */
export async function leaveWorkspace(input: {
  userId: string
  workspaceId: string
}): Promise<void> {
  let deletedWorkspace = false

  await workspaceMutationLock.run(input.workspaceId, async () => {
    await prisma.$transaction(async (tx) => {
      const ws = await requireManagedWorkspace(tx, input.workspaceId, input.userId, 'VIEWER')
      const membership = ws.members.find((member) => member.user_id === input.userId)!

      if (membership.role === 'OWNER') {
        if (ws.members.length > 1) throw new WorkspaceOwnershipTransferRequiredError()
        await tx.workspace.update({
          where: { id: input.workspaceId },
          data: softDeletedBy(input.userId),
        })
        deletedWorkspace = true
        return
      }

      await tx.workspaceMember.update({
        where: {
          workspace_id_user_id: {
            workspace_id: input.workspaceId,
            user_id: input.userId,
          },
        },
        data: softDeletedBy(input.userId),
      })
    })

    if (deletedWorkspace) await workspaceInvitationStore.discardWorkspace(input.workspaceId)
  })

  if (deletedWorkspace) {
    finalizeWorkspaceDeletion(input.workspaceId, input.userId)
    return
  }

  finalizeMemberRemoval(input.workspaceId, input.userId, input.userId)
}

/**
 * Change a member's role. Caller must be ADMIN+.
 * OWNER membership is intentionally immutable here: ownership transfer is a
 * separate workflow, not an ordinary member-role update.
 */
export async function changeMemberRole(input: {
  userId: string
  workspaceId: string
  targetUserId: string
  role: Role
}) {
  const workspace = await workspaceMutationLock.run(input.workspaceId, () =>
    prisma.$transaction(async (tx) => {
      const ws = await requireManagedWorkspace(tx, input.workspaceId, input.userId, 'ADMIN')

      const targetMembership = ws.members.find((member) => member.user_id === input.targetUserId)
      if (!targetMembership) throw new NotFoundError()
      const callerMembership = ws.members.find((member) => member.user_id === input.userId)!

      requireRoleChangeAllowed(callerMembership.role, targetMembership, input.role)

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
    }),
  )

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
 * A caller can remove only members whose role is strictly lower than theirs.
 */
export async function removeMember(input: {
  userId: string
  workspaceId: string
  targetUserId: string
}) {
  await workspaceMutationLock.run(input.workspaceId, () =>
    prisma.$transaction(async (tx) => {
      const ws = await requireManagedWorkspace(tx, input.workspaceId, input.userId, 'ADMIN')

      const targetMembership = ws.members.find((member) => member.user_id === input.targetUserId)
      if (!targetMembership) throw new NotFoundError()
      const callerMembership = ws.members.find((member) => member.user_id === input.userId)!

      if (!workspaceRoleOutranks(callerMembership.role, targetMembership.role)) {
        throw new WorkspaceRoleHierarchyError()
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
    }),
  )

  finalizeMemberRemoval(input.workspaceId, input.targetUserId, input.userId)
}

export async function inviteWorkspaceMember(input: {
  userId: string
  workspaceId: string
  email: string
  role: Exclude<Role, 'OWNER'>
}): Promise<void> {
  const email = normalizeEmail(input.email)

  await workspaceMutationLock.run(input.workspaceId, async () => {
    const workspace = await getWorkspace({
      userId: input.userId,
      workspaceId: input.workspaceId,
    })
    const callerRole = await requireWorkspaceRole(input.workspaceId, input.userId, 'ADMIN')
    if (!workspaceRoleOutranks(callerRole, input.role)) {
      throw new WorkspaceRoleHierarchyError()
    }
    await checkMailRateLimit({
      senderUserId: input.userId,
      recipientEmail: email,
    })

    const token = await workspaceInvitationStore.create({
      workspaceId: input.workspaceId,
      role: input.role,
    })
    const inviteUrl = `${config.appOrigin}/invite/${token}`

    try {
      await enqueue({
        to: email,
        ...inviteEmail(workspace.name, inviteUrl),
      })
    } catch (error) {
      await workspaceInvitationStore.discard(token)
      throw error
    }
  })
}

/**
 * Preview an invite without consuming it.
 */
export async function previewInvite(input: { userId: string; token: string }) {
  const invitation = await workspaceInvitationStore.preview(input.token)
  if (!invitation) throw new InviteTokenError()

  const workspace = await prisma.workspace.findFirst({
    where: { id: invitation.workspaceId, deleted_at: null },
    select: {
      name: true,
      members: {
        where: {
          user_id: input.userId,
          deleted_at: null,
        },
        select: { role: true },
      },
    },
  })
  if (!workspace) throw new InviteTokenError()
  const existing = workspace.members[0]

  return {
    workspace_name: workspace.name,
    role: invitation.role,
    already_member: Boolean(existing),
    ...(existing && { current_role: existing.role }),
  }
}

/**
 * Consume an invite and add the signed-in user as a member.
 * Returns the workspace DTO on success.
 */
export async function acceptInvite(input: { userId: string; token: string }) {
  const pendingInvitation = await workspaceInvitationStore.preview(input.token)
  if (!pendingInvitation) throw new InviteTokenError()

  const ws = await prisma.workspace.findFirst({
    where: { id: pendingInvitation.workspaceId, deleted_at: null },
    include: workspaceInclude,
  })
  if (!ws) throw new InviteTokenError()

  if (ws.members.some((member) => member.user_id === input.userId)) {
    return toWorkspaceDto(ws, { includeMemberEmail: true })
  }

  const invitation = await workspaceInvitationStore.take(input.token)
  if (!invitation) throw new InviteTokenError()

  const invitee = await prisma.user.findFirst({
    where: { id: input.userId, deleted_at: null },
    select: { name: true, profile_image_url: true },
  })
  if (!invitee) throw new InviteTokenError()

  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspace_id_user_id: {
        workspace_id: invitation.workspaceId,
        user_id: input.userId,
      },
    },
  })

  if (existing?.deleted_at === null) {
    return toWorkspaceDto(ws, { includeMemberEmail: true })
  }

  const joined = await lockMembershipPair(invitation.workspaceId, input.userId, (tx) =>
    writeActiveMembership(tx, invitation.workspaceId, input.userId, invitation.role),
  )

  const updated = await prisma.workspace.findFirst({
    where: { id: invitation.workspaceId, deleted_at: null },
    include: workspaceInclude,
  })

  if (joined) {
    announceMemberJoined(ws, {
      userId: input.userId,
      name: invitee.name,
      profileImageUrl: invitee.profile_image_url,
    })
  }

  return toWorkspaceDto(updated!, { includeMemberEmail: true })
}
