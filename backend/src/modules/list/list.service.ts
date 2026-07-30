// ============================================================
// list.service.ts — List CRUD business logic
//
// Lists belong directly to a Workspace (Workspace *is* the board).
// Mirrors workspace.service.ts conventions: Prisma singleton,
// soft delete via deleted_at, role checks via the shared workspace helper.
// ============================================================
import { prisma } from '../../db'
import {
  ForbiddenError,
  NotFoundError,
} from '../../errors'
import { createdBy, softDeletedBy, updatedBy } from '../../lib/audit'
import { computeSequence } from '../../lib/ordering'
import {
  getWorkspaceRole,
  requireWorkspaceRole,
} from '../../lib/workspace-permissions'
import { toBoardListDto, toListDto } from './list.dto'
import { publishWorkspaceChange } from '../workspace/workspace.realtime'

async function assertReadAccess(userId: string, workspaceId: string): Promise<void> {
  const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, deleted_at: null } })
  if (!ws) throw new NotFoundError()
  if (ws.is_public) return
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!role) throw new ForbiddenError()
}

/**
 * List all lists in a workspace, with their cards, for the board's initial render.
 * Member of the workspace OR a public workspace.
 */
export async function listLists(input: { userId: string; workspaceId: string }) {
  await assertReadAccess(input.userId, input.workspaceId)

  const lists = await prisma.list.findMany({
    where: { workspace_id: input.workspaceId, deleted_at: null },
    orderBy: { sequence: 'asc' },
    include: {
      cards: {
        where: { deleted_at: null },
        orderBy: { sequence: 'asc' },
      },
    },
  })

  return lists.map(toBoardListDto)
}

export async function getList(input: { userId: string; listId: string }) {
  const list = await prisma.list.findFirst({
    where: { id: input.listId, deleted_at: null },
    include: {
      cards: {
        where: { deleted_at: null },
        orderBy: { sequence: 'asc' },
      },
    },
  })
  if (!list) throw new NotFoundError()

  await assertReadAccess(input.userId, list.workspace_id)
  return toBoardListDto(list)
}

/**
 * Create a list at the end of the workspace's board. Requires MEMBER+.
 */
export async function createList(input: {
  userId: string
  workspaceId: string
  name: string
  isDone?: boolean
}) {
  await requireWorkspaceRole(input.workspaceId, input.userId, 'MEMBER')

  const agg = await prisma.list.aggregate({
    where: { workspace_id: input.workspaceId, deleted_at: null },
    _max: { sequence: true },
  })

  const list = await prisma.list.create({
    data: {
      workspace_id: input.workspaceId,
      name: input.name,
      sequence: (agg._max.sequence ?? 0) + 1,
      is_done: input.isDone ?? false,
      ...createdBy(input.userId),
    },
  })
  const dto = toListDto(list)
  publishWorkspaceChange({
    workspace_id: input.workspaceId,
    entity: 'list',
    action: 'created',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
  return dto
}

/**
 * Update a list's name and/or completion marker. Requires MEMBER+.
 */
export async function updateList(input: {
  userId: string
  listId: string
  name?: string
  isDone?: boolean
}) {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  const updated = await prisma.list.update({
    where: { id: input.listId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isDone !== undefined ? { is_done: input.isDone } : {}),
      ...updatedBy(input.userId),
    },
  })
  const dto = toListDto(updated)
  publishWorkspaceChange({
    workspace_id: list.workspace_id,
    entity: 'list',
    action: 'updated',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
  return dto
}

/**
 * Soft-delete a list. Cards keep existing (list_id is set null via the
 * onDelete: SetNull relation semantics we replicate manually since this is
 * a soft delete, not a hard delete). Requires MEMBER+.
 */
export async function deleteList(input: { userId: string; listId: string }): Promise<void> {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  const detachedRelation = softDeletedBy(input.userId)
  await prisma.$transaction(async (tx) => {
    // Mark the list first so a concurrent inbox restore cannot attach a card
    // after the card transfer has already scanned this list.
    await tx.list.update({
      where: { id: input.listId },
      data: softDeletedBy(input.userId),
    })
    await tx.$queryRaw`
      SELECT "id"
      FROM "Cards"
      WHERE "list_id" = ${input.listId}::uuid
        AND "deleted_at" IS NULL
      FOR UPDATE
    `
    await tx.cardMember.updateMany({
      where: {
        deleted_at: null,
        card: { list_id: input.listId, deleted_at: null },
      },
      data: detachedRelation,
    })
    await tx.cardLabel.updateMany({
      where: {
        deleted_at: null,
        card: { list_id: input.listId, deleted_at: null },
      },
      data: detachedRelation,
    })
    await tx.card.updateMany({
      where: { list_id: input.listId, deleted_at: null },
      data: {
        list_id: null,
        user_id: input.userId,
        ...updatedBy(input.userId),
      },
    })
  })

  publishWorkspaceChange({
    workspace_id: list.workspace_id,
    entity: 'list',
    action: 'deleted',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
}

/**
 * Reorder a list among its workspace siblings using neighbor ids.
 * Requires MEMBER+.
 */
export async function reorderList(
  input: {
    userId: string
    listId: string
    beforeListId?: string | null
    afterListId?: string | null
  },
) {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  const siblings = await prisma.list.findMany({
    where: { workspace_id: list.workspace_id, deleted_at: null, id: { not: input.listId } },
    orderBy: { sequence: 'asc' },
  })

  const newSequence = computeSequence(
    siblings,
    input.beforeListId,
    input.afterListId,
  )
  const updated = await prisma.list.update({
    where: { id: input.listId },
    data: { sequence: newSequence, ...updatedBy(input.userId) },
  })
  const dto = toListDto(updated)
  publishWorkspaceChange({
    workspace_id: list.workspace_id,
    entity: 'list',
    action: 'moved',
    entity_id: list.id,
    list_ids: [list.id],
    actor_user_id: input.userId,
  })
  return dto
}
