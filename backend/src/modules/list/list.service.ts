// ============================================================
// list.service.ts — List CRUD business logic
//
// Lists belong directly to a Workspace (Workspace *is* the board).
// Mirrors workspace.service.ts conventions: Prisma singleton,
// soft delete via deleted_at, role checks via workspace ROLE_RANK.
// ============================================================
import { prisma } from '../../db'
import type { Card, List } from '@prisma/client'
import { ForbiddenError, NotFoundError } from '../../errors'
import { getRole, requireRole } from '../workspace/workspace.service'

function toDTO(list: List) {
  return {
    id: list.id,
    workspace_id: list.workspace_id,
    name: list.name,
    sequence: list.sequence,
  }
}

// Minimal card summary for the board's initial load. Full detail
// (members/labels/attachments) is only returned by GET /cards/{card_id}.
function toCardSummaryDTO(card: Card) {
  return {
    id: card.id,
    list_id: card.list_id,
    title: card.title,
    description: card.description,
    start_at: card.start_at,
    deadline: card.deadline,
    sequence: card.sequence,
    created_at: card.created_at,
  }
}

async function assertReadAccess(userId: string, workspaceId: string): Promise<void> {
  const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, deleted_at: null } })
  if (!ws) throw new NotFoundError()
  if (ws.is_public) return
  const role = await getRole(workspaceId, userId)
  if (!role) throw new ForbiddenError()
}

// Fractional-indexing midpoint for reorder operations.
function computeSequence(siblings: List[], beforeId?: string | null, afterId?: string | null): number {
  const before = beforeId ? siblings.find((l) => l.id === beforeId) : null
  const after = afterId ? siblings.find((l) => l.id === afterId) : null
  if (!before && !after) return (siblings[siblings.length - 1]?.sequence ?? 0) + 1
  if (!before) return after!.sequence - 1
  if (!after) return before.sequence + 1
  return (before.sequence + after.sequence) / 2
}

/**
 * List all lists in a workspace, with their cards, for the board's initial render.
 * Member of the workspace OR a public workspace.
 */
export async function listLists(userId: string, workspaceId: string) {
  await assertReadAccess(userId, workspaceId)

  const lists = await prisma.list.findMany({
    where: { workspace_id: workspaceId, deleted_at: null },
    orderBy: { sequence: 'asc' },
    include: {
      cards: {
        where: { deleted_at: null },
        orderBy: { sequence: 'asc' },
      },
    },
  })

  return lists.map((l) => ({
    ...toDTO(l),
    cards: l.cards.map(toCardSummaryDTO),
  }))
}

/**
 * Create a list at the end of the workspace's board. Requires MEMBER+.
 */
export async function createList(userId: string, workspaceId: string, name: string) {
  await requireRole(workspaceId, userId, 'MEMBER')

  const agg = await prisma.list.aggregate({
    where: { workspace_id: workspaceId, deleted_at: null },
    _max: { sequence: true },
  })

  const list = await prisma.list.create({
    data: {
      workspace_id: workspaceId,
      name,
      sequence: (agg._max.sequence ?? 0) + 1,
      created_by: userId,
      updated_by: userId,
    },
  })
  return toDTO(list)
}

/**
 * Rename a list. Requires MEMBER+.
 */
export async function updateList(userId: string, listId: string, name: string) {
  const list = await prisma.list.findFirst({ where: { id: listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireRole(list.workspace_id, userId, 'MEMBER')

  const updated = await prisma.list.update({
    where: { id: listId },
    data: { name, updated_by: userId },
  })
  return toDTO(updated)
}

/**
 * Soft-delete a list. Cards keep existing (list_id is set null via the
 * onDelete: SetNull relation semantics we replicate manually since this is
 * a soft delete, not a hard delete). Requires MEMBER+.
 */
export async function deleteList(userId: string, listId: string): Promise<void> {
  const list = await prisma.list.findFirst({ where: { id: listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireRole(list.workspace_id, userId, 'MEMBER')

  await prisma.$transaction([
    prisma.card.updateMany({
      where: { list_id: listId, deleted_at: null },
      data: { list_id: null, updated_by: userId },
    }),
    prisma.list.update({
      where: { id: listId },
      data: { deleted_at: new Date(), deleted_by: userId, updated_by: userId },
    }),
  ])
}

/**
 * Reorder a list among its workspace siblings using neighbor ids.
 * Requires MEMBER+.
 */
export async function reorderList(
  userId: string,
  listId: string,
  data: { before_list_id?: string | null; after_list_id?: string | null },
) {
  const list = await prisma.list.findFirst({ where: { id: listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  await requireRole(list.workspace_id, userId, 'MEMBER')

  const siblings = await prisma.list.findMany({
    where: { workspace_id: list.workspace_id, deleted_at: null, id: { not: listId } },
    orderBy: { sequence: 'asc' },
  })

  const newSequence = computeSequence(siblings, data.before_list_id, data.after_list_id)
  const updated = await prisma.list.update({
    where: { id: listId },
    data: { sequence: newSequence, updated_by: userId },
  })
  return toDTO(updated)
}
