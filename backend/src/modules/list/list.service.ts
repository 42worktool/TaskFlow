// ============================================================
// list.service.ts — List CRUD business logic
//
// Lists belong directly to a Workspace (Workspace *is* the board).
// Mirrors workspace.service.ts conventions: Prisma singleton,
// soft delete via deleted_at, role checks via workspace ROLE_RANK.
// ============================================================
import { prisma } from '../../db'
import { ForbiddenError, NotFoundError } from '../../errors'
import { getRole, requireRole } from '../workspace/workspace.service'
import { createdBy, softDeletedBy, updatedBy } from '../../lib/audit'
import { computeSequence } from '../../lib/ordering'
import { toBoardListDto, toListDto } from './list.dto'

async function assertReadAccess(userId: string, workspaceId: string): Promise<void> {
  const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, deleted_at: null } })
  if (!ws) throw new NotFoundError()
  if (ws.is_public) return
  const role = await getRole(workspaceId, userId)
  if (!role) throw new ForbiddenError()
}

/**
 * List all lists in a workspace, with their cards, for the board's initial render.
 * Member of the workspace OR a public workspace.
 */
export async function listLists(input: { actorId: string; workspaceId: string }) {
  await assertReadAccess(input.actorId, input.workspaceId)

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

/**
 * Create a list at the end of the workspace's board. Requires MEMBER+.
 */
export async function createList(input: {
  actorId: string
  workspaceId: string
  name: string
}) {
  await requireRole(input.workspaceId, input.actorId, 'MEMBER')

  const agg = await prisma.list.aggregate({
    where: { workspace_id: input.workspaceId, deleted_at: null },
    _max: { sequence: true },
  })

  const list = await prisma.list.create({
    data: {
      workspace_id: input.workspaceId,
      name: input.name,
      sequence: (agg._max.sequence ?? 0) + 1,
      ...createdBy(input.actorId),
    },
  })
  return toListDto(list)
}

/**
 * Rename a list. Requires MEMBER+.
 */
export async function updateList(input: { actorId: string; listId: string; name: string }) {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireRole(list.workspace_id, input.actorId, 'MEMBER')

  const updated = await prisma.list.update({
    where: { id: input.listId },
    data: { name: input.name, ...updatedBy(input.actorId) },
  })
  return toListDto(updated)
}

/**
 * Soft-delete a list. Cards keep existing (list_id is set null via the
 * onDelete: SetNull relation semantics we replicate manually since this is
 * a soft delete, not a hard delete). Requires MEMBER+.
 */
export async function deleteList(input: { actorId: string; listId: string }): Promise<void> {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireRole(list.workspace_id, input.actorId, 'MEMBER')

  await prisma.$transaction([
    prisma.card.updateMany({
      where: { list_id: input.listId, deleted_at: null },
      data: {
        list_id: null,
        user_id: input.actorId,
        ...updatedBy(input.actorId),
      },
    }),
    prisma.list.update({
      where: { id: input.listId },
      data: softDeletedBy(input.actorId),
    }),
  ])
}

/**
 * Reorder a list among its workspace siblings using neighbor ids.
 * Requires MEMBER+.
 */
export async function reorderList(
  input: {
    actorId: string
    listId: string
    beforeListId?: string | null
    afterListId?: string | null
  },
) {
  const list = await prisma.list.findFirst({ where: { id: input.listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireRole(list.workspace_id, input.actorId, 'MEMBER')

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
    data: { sequence: newSequence, ...updatedBy(input.actorId) },
  })
  return toListDto(updated)
}
