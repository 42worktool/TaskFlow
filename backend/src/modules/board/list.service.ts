import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/http";
import { assertWorkspaceMember, canReadWorkspace } from "./workspaceGuard";

const LIST_BLOCK = 65536;
const MIN_GAP = 1e-6;

export interface ListDto {
  id: string;
  workspace_id: string;
  name: string;
  sequence: number;
}

function toDto(row: {
  id: string;
  workspace_id: string;
  name: string;
  sequence: number;
}): ListDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    sequence: row.sequence,
  };
}

export const listService = {
  async create(workspaceId: string, name: string, actorId: string): Promise<ListDto> {
    if (!actorId) throw ApiError.unauthorized();
    await assertWorkspaceMember(workspaceId, actorId, "MEMBER");
    const maxSeq = await prisma.list.aggregate({
      where: { workspace_id: workspaceId },
      _max: { sequence: true },
    });
    const sequence = (maxSeq._max.sequence ?? 0) + LIST_BLOCK;
    const list = await prisma.list.create({
      data: { workspace_id: workspaceId, name, sequence },
    });
    return toDto(list);
  },

  async update(listId: string, name: string, actorId: string): Promise<ListDto> {
    if (!actorId) throw ApiError.unauthorized();
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: { id: true, workspace_id: true },
    });
    if (!list) throw ApiError.notFound("List not found");

    await assertWritableRank(list.workspace_id, actorId);
    const updated = await prisma.list.update({
      where: { id: listId },
      data: { name },
    });
    return toDto(updated);
  },

  async remove(listId: string, actorId: string): Promise<void> {
    if (!actorId) throw ApiError.unauthorized();
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: { id: true, workspace_id: true },
    });
    if (!list) throw ApiError.notFound("List not found");

    await assertWritableRank(list.workspace_id, actorId);

    // Cards.list_id ON DELETE SET NULL -> cards become inbox, not deleted (CONSIDERATIONS).
    await prisma.list.delete({ where: { id: listId } });
  },

  async reorder(
    listId: string,
    input: { before_list_id?: string | null; after_list_id?: string | null },
    actorId: string,
  ): Promise<ListDto> {
    if (!actorId) throw ApiError.unauthorized();
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: { id: true, workspace_id: true },
    });
    if (!list) throw ApiError.notFound("List not found");

    await canReadWorkspace(list.workspace_id, actorId);
    await assertWorkspaceMember(list.workspace_id, actorId, "MEMBER");
    const workspaceId = list.workspace_id;

    // No neighbours -> become the only / front list at default position.
    if (input.before_list_id === undefined && input.after_list_id === undefined) {
      const target = await prisma.list.update({
        where: { id: listId },
        data: { sequence: LIST_BLOCK },
      });
      return toDto(target);
    }

    const neighbors = await prisma.list.findMany({
      where: { workspace_id: workspaceId, NOT: { id: listId } },
      orderBy: { sequence: "asc" },
      select: { id: true, sequence: true },
    });

    const before = input.before_list_id
      ? neighbors.find((n) => n.id === input.before_list_id)
      : null;
    const after = input.after_list_id
      ? neighbors.find((n) => n.id === input.after_list_id)
      : null;

    if (input.before_list_id && !before)
      throw ApiError.badRequest("BAD_REQUEST", "before_list_id not found");
    if (input.after_list_id && !after)
      throw ApiError.badRequest("BAD_REQUEST", "after_list_id not found");

    let newSeq: number;
    let needsRebalance = false;

    if (before && after) {
      newSeq = (before.sequence + after.sequence) / 2;
      if (Math.abs(newSeq - before.sequence) < MIN_GAP) needsRebalance = true;
    } else if (before) {
      newSeq = before.sequence + LIST_BLOCK;
    } else if (after) {
      newSeq = after.sequence / 2;
      if (newSeq < MIN_GAP) needsRebalance = true;
    } else {
      newSeq = (maxSequence(neighbors) ?? 0) + LIST_BLOCK;
    }

    if (needsRebalance) {
      await rebalanceWorkspaceLists(workspaceId, listId, input);
    } else {
      await prisma.list.update({ where: { id: listId }, data: { sequence: newSeq } });
    }

    const updated = await prisma.list.findUniqueOrThrow({ where: { id: listId } });
    return toDto(updated);
  },
};

function maxSequence(rows: { sequence: number }[]): number | null {
  return rows.length ? Math.max(...rows.map((r) => r.sequence)) : null;
}

async function rebalanceWorkspaceLists(
  workspaceId: string,
  movedListId: string,
  desired: { before_list_id?: string | null; after_list_id?: string | null },
): Promise<void> {
  const all = await prisma.list.findMany({
    where: { workspace_id: workspaceId },
    orderBy: { sequence: "asc" },
    select: { id: true },
  });
  const ids = all.map((l) => l.id);
  const movedIdx = ids.indexOf(movedListId);
  if (movedIdx !== -1) ids.splice(movedIdx, 1);

  const afterId = desired.after_list_id ?? null;
  const beforeId = desired.before_list_id ?? null;
  let insertIdx = ids.length;
  if (afterId && ids.includes(afterId))
    insertIdx = Math.min(insertIdx, ids.indexOf(afterId) + 1);
  if (beforeId && ids.includes(beforeId))
    insertIdx = Math.min(insertIdx, ids.indexOf(beforeId));
  ids.splice(Math.max(0, insertIdx), 0, movedListId);

  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.list.update({
        where: { id },
        data: { sequence: (i + 1) * LIST_BLOCK },
      }),
    ),
  );
}

async function assertWritableRank(workspaceId: string, actorId: string): Promise<void> {
  await canReadWorkspace(workspaceId, actorId);
  await assertWorkspaceMember(workspaceId, actorId, "MEMBER");
}