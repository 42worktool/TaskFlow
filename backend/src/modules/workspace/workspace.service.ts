// ============================================================
// workspace.service.ts — 워크스페이스 CRUD와 멤버십 정책
//
// 모든 함수는 공용 Prisma 클라이언트를 사용한다. 권한과 역할 계층은 서비스에서
// 검사하고 컨트롤러는 입력 파싱과 상태 코드 같은 HTTP 책임만 맡는다.
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
  // 워크스페이스와 활성 멤버를 한 결과로 받아 호출자 역할과 대상을 일관된 객체에서 판단한다.
  // 이 조회가 동시 수정을 직렬화하지는 않으므로 변경 작업의 순서는 바깥 lock이 담당한다.
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
  // 관리자는 자기보다 낮은 현재 역할만 다룰 수 있고, 새로 부여할 역할도 자기보다 낮아야 한다.
  if (
    !workspaceRoleOutranks(callerRole, targetMembership.role) ||
    !workspaceRoleOutranks(callerRole, newRole)
  ) {
    throw new WorkspaceRoleHierarchyError()
  }
}

function finalizeWorkspaceDeletion(workspaceId: string, actorUserId: string): void {
  // DB 커밋 뒤 구독 권한을 무효화하고 삭제 이벤트를 보낸 후 채널을 비운다.
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
  // 제거된 사용자의 모든 탭을 채널에서 내보내 더 이상 워크스페이스 이벤트를 받지 못하게 한다.
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
// 외부 공개 API
// ============================================================

/**
 * 사용자가 볼 수 있는 워크스페이스를 두 그룹으로 조회한다.
 * my는 가입한 비공개/공개 공간, public은 아직 가입하지 않은 공개 공간이다.
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
 * (workspace_id, user_id) 쌍의 PostgreSQL advisory lock을 잡은 트랜잭션에서
 * operation을 실행한다. 같은 멤버십을 생성/복구하거나 공개 공간 가입 상태를
 * 재검사하는 동시 요청을 읽기 전부터 직렬화한다.
 *
 * 신규 멤버십은 아직 잠글 행이 없어 FOR UPDATE만으로 보호할 수 없다. 두 요청이
 * 모두 행이 없다고 판단해 동시에 create한 뒤 unique 제약에서 충돌하는 것을 막기 위해
 * 행의 존재 여부와 무관한 advisory lock을 사용한다.
 */
async function lockMembershipPair<T>(
  workspaceId: string,
  userId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock은 Prisma가 $queryRaw로 역직렬화할 수 없는 void를 반환한다.
    // 결과가 필요 없는 잠금 문장이므로 $executeRaw로 실행한다.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}), hashtext(${userId}))`
    return operation(tx)
  })
}

/**
 * soft delete된 멤버십은 복구하고 없으면 새로 만든다. WorkspaceMember의 PK가
 * (workspace_id, user_id)이므로 과거에 제거된 관계는 재생성할 수 없다.
 * 호출자가 이미 쌍의 advisory lock을 잡았다고 가정하고 읽기/쓰기만 수행한다.
 *
 * 비활성 상태에서 실제로 활성화됐는지를 반환해 경쟁 요청이 있어도 참여 알림을
 * 정확히 한 번만 발행할 수 있게 한다.
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

/** 멤버십 생성/복구가 커밋된 뒤 알림과 실시간 이벤트를 함께 전파한다. */
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
 * 워크스페이스 행을 잠가 공개 여부 변경이나 삭제가 상태 검사와 멤버십 쓰기 사이에
 * 끼어들지 못하게 한다. update가 잡는 배타 잠금과 같은 행 잠금을 요청하므로 먼저
 * 도착한 트랜잭션이 끝날 때까지 다른 쪽이 기다리고, 오래된 스냅샷으로 쓰지 않는다.
 *
 * 멤버십 쌍과 달리 워크스페이스 행은 이미 존재하므로 advisory lock이 아닌
 * 일반 FOR UPDATE만으로 충분하다.
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
 * 비회원이 공개 워크스페이스를 처음 열면 VIEWER 멤버십을 자동 생성한다.
 * 최초 공개 여부 확인과 실제 쓰기는 별도 시점이므로, 잠금을 얻는 동안 비공개 전환이나
 * 삭제가 일어날 수 있다. 따라서 잠긴 트랜잭션 안에서 최신 상태를 다시 확인하고
 * 현재 행 자체를 반환해 호출자가 존재한다고 가정한 재조회에 의존하지 않게 한다.
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
      // 잠금을 기다리는 동안 비공개가 됐거나 다른 경로로 가입됐다.
      // 여기서는 쓰지 않고 호출자가 최신 상태로 접근 가능 여부를 다시 판단한다.
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
 * ID로 워크스페이스를 조회한다. 활성 멤버이거나 공개 공간일 때만 접근할 수 있다.
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
  // 위의 오래된 조회 결과가 아닌 잠금 이후 최신 상태로 다시 검증한다.
  // 그 사이 삭제되면 NotFound, 비공개로 바뀐 비회원이면 Forbidden이 된다.
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
 * 워크스페이스와 생성자의 OWNER 멤버십을 하나의 중첩 쓰기로 함께 생성한다.
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
 * 이름/공개 여부를 부분 수정한다. ADMIN 이상만 가능하다.
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
 * 워크스페이스를 soft delete한다. 하위 데이터는 감사와 복구를 위해 보존하고
 * 활성 워크스페이스 필터로 숨긴다. 다른 멤버가 없는 OWNER만 실행할 수 있다.
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
 * 하나뿐인 OWNER 역할을 활성 멤버에게 위임한다. 이전 소유자는 ADMIN으로 남아
 * 일반 나가기 흐름을 사용할 수 있다. 두 역할 변경은 한 트랜잭션으로 처리한다.
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
 * 워크스페이스에서 나간다. 유일한 멤버인 OWNER는 빈 공간을 함께 삭제하고,
 * 다른 활성 멤버가 있으면 먼저 소유권을 위임해야 한다.
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
 * 멤버 역할을 변경한다. 호출자는 ADMIN 이상이어야 하며 자기보다 낮은 역할만 다룬다.
 * OWNER 변경은 일반 역할 수정이 아니라 별도의 소유권 위임 흐름으로만 허용한다.
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
 * 멤버를 워크스페이스에서 soft delete한다. ADMIN 이상이면서 자신보다 낮은 역할만
 * 제거할 수 있어 ADMIN끼리 또는 OWNER를 임의로 추방하지 못한다.
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

    // 초대 토큰을 먼저 만들고 큐 등록 자체가 실패하면 즉시 폐기해, 큐에도 없는
    // 유효 초대가 Redis에 남지 않게 한다. 큐 등록 이후의 실제 메일 전달은 별도 단계다.
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
 * 초대 페이지 표시에 필요한 정보를 토큰을 소비하지 않고 확인한다.
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
 * 초대 토큰을 한 번만 소비하고 로그인 사용자를 멤버로 추가한다.
 * 이미 활성 멤버면 토큰을 소비하지 않고 현재 워크스페이스를 반환한다.
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
