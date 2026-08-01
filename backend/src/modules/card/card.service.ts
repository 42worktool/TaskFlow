// ============================================================
// card.service.ts — Card (+ members, attachments, comments) business logic
//
// Mirrors workspace.service.ts conventions: Prisma singleton, soft delete
// via deleted_at, role checks via the shared workspace helper. Cards with
// list_id === null are personal inbox cards; access to those is by
// ownership (user_id), not workspace role.
// ============================================================
import path from 'node:path'
import { prisma } from '../../db'
import type { Card, List, Prisma, Role } from '@prisma/client'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors'
import { createdBy, restoredBy, softDeletedBy, updatedBy } from '../../lib/audit'
import { computeSequence } from '../../lib/ordering'
import { userSummarySelect } from '../../lib/user-summary'
import { UPLOAD_DIR, deleteUploadedFile } from '../../lib/upload'
import {
  getWorkspaceRole,
  requireWorkspaceRole,
} from '../../lib/workspace-permissions'
import {
  toAttachmentDto,
  toCardDetailDto,
  toCardDto,
  toCommentDto,
} from './card.dto'
import { publishWorkspaceChange } from '../workspace/workspace.realtime'

// ─── DTOs ─────────────────────────────────────────────────────

async function buildCardDetail(card: Card) {
  const [members, labels, attachments, comments] = await Promise.all([
    prisma.cardMember.findMany({
      where: { card_id: card.id, deleted_at: null },
      include: { user: { select: userSummarySelect } },
    }),
    prisma.cardLabel.findMany({
      where: {
        card_id: card.id,
        deleted_at: null,
        label: { deleted_at: null },
      },
      orderBy: { created_at: 'asc' },
      include: {
        label: {
          select: { id: true, label_name: true, label_color: true },
        },
      },
    }),
    prisma.attachment.findMany({
      where: { card_id: card.id, deleted_at: null },
      orderBy: { created_at: 'asc' },
    }),
    prisma.comment.findMany({
      where: { card_id: card.id, deleted_at: null },
      orderBy: { created_at: 'asc' },
      include: {
        user: { select: userSummarySelect },
      },
    }),
  ])

  return toCardDetailDto(card, members, labels, attachments, comments)
}

// ─── Access helpers ───────────────────────────────────────────

async function getCardOrThrow(cardId: string): Promise<Card> {
  const card = await prisma.card.findFirst({ where: { id: cardId, deleted_at: null } })
  if (!card) throw new NotFoundError()
  return card
}

type CardAccessClient = Pick<
  Prisma.TransactionClient,
  'list' | 'workspaceMember'
>

async function getListOrThrow(
  listId: string,
  client: CardAccessClient = prisma,
): Promise<List> {
  const list = await client.list.findFirst({
    where: { id: listId, deleted_at: null },
  })
  if (!list) throw new NotFoundError()
  return list
}

/** Write access: inbox card owner, or MEMBER+ in the card's workspace. */
type CardAccess = Pick<
  Card,
  'list_id' | 'user_id' | 'is_completed' | 'start_at' | 'deadline'
>

interface WorkspaceCardLocation {
  workspaceId: string
  listId: string
}

async function lockCardOrThrow(
  tx: Prisma.TransactionClient,
  cardId: string,
): Promise<CardAccess> {
  const cards = await tx.$queryRaw<CardAccess[]>`
    SELECT "list_id", "user_id", "is_completed", "start_at", "deadline"
    FROM "Cards"
    WHERE "id" = ${cardId}::uuid
      AND "deleted_at" IS NULL
    FOR UPDATE
  `
  const card = cards[0]
  if (!card) throw new NotFoundError()
  return card
}

async function requireCardWrite(
  card: CardAccess,
  userId: string,
  client: CardAccessClient = prisma,
): Promise<void> {
  await requireCardRole(card, userId, 'MEMBER', client)
}

async function requireCardRole(
  card: CardAccess,
  userId: string,
  minRole?: Role,
  client: CardAccessClient = prisma,
): Promise<Role | null> {
  if (card.list_id === null) {
    if (card.user_id !== userId) throw new ForbiddenError()
    return null
  }
  const list = await getListOrThrow(card.list_id, client)
  if (minRole) {
    return requireWorkspaceRole(list.workspace_id, userId, minRole, client)
  }
  const role = await getWorkspaceRole(list.workspace_id, userId, client)
  if (!role) throw new ForbiddenError()
  return role
}

async function workspaceLocationForCard(
  card: CardAccess,
  client: CardAccessClient = prisma,
): Promise<WorkspaceCardLocation | null> {
  if (!card.list_id) return null
  const list = await getListOrThrow(card.list_id, client)
  return {
    workspaceId: list.workspace_id,
    listId: list.id,
  }
}

function publishCardChange(input: {
  userId: string
  cardId: string
  location: WorkspaceCardLocation | null
  action: 'created' | 'updated' | 'deleted' | 'moved'
  listIds?: string[]
}): void {
  if (!input.location) return
  publishWorkspaceChange({
    workspace_id: input.location.workspaceId,
    entity: 'card',
    action: input.action,
    entity_id: input.cardId,
    list_ids: input.listIds ?? [],
    actor_user_id: input.userId,
  })
}

// ─── Cards ────────────────────────────────────────────────────

export async function listInboxCards(input: { userId: string }) {
  const cards = await prisma.card.findMany({
    where: {
      list_id: null,
      user_id: input.userId,
      deleted_at: null,
    },
    orderBy: { updated_at: 'desc' },
  })
  return cards.map(toCardDto)
}

export async function createCard(
  input: {
    userId: string
    listId: string
    title: string
    description?: string | null
    startAt?: string | null
    deadline?: string | null
  },
) {
  const list = await getListOrThrow(input.listId)
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  const created = await prisma.$transaction(async (tx) => {
    const lockedList = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Lists"
      WHERE "id" = ${input.listId}::uuid
        AND "deleted_at" IS NULL
      FOR UPDATE
    `
    if (lockedList.length === 0) throw new NotFoundError()

    const agg = await tx.card.aggregate({
      where: { list_id: input.listId, deleted_at: null },
      _max: { sequence: true },
    })

    const card = await tx.card.create({
      data: {
        list_id: input.listId,
        title: input.title,
        description: input.description ?? '',
        start_at: input.startAt ? new Date(input.startAt) : null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        sequence: (agg._max.sequence ?? 0) + 1,
        ...createdBy(input.userId),
      },
    })
    return toCardDto(card)
  })

  publishCardChange({
    userId: input.userId,
    cardId: created.id,
    location: {
      workspaceId: list.workspace_id,
      listId: list.id,
    },
    action: 'created',
    listIds: [list.id],
  })
  return created
}

export async function getCard(input: { userId: string; cardId: string }) {
  const card = await getCardOrThrow(input.cardId)
  await requireCardRole(card, input.userId)
  return buildCardDetail(card)
}

export async function updateCard(
  input: {
    userId: string
    cardId: string
    title?: string
    description?: string | null
  },
) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    const location = await workspaceLocationForCard(card, tx)

    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...('description' in input
          ? { description: input.description ?? '' }
          : {}),
        ...updatedBy(input.userId),
      },
    })
    return {
      card: toCardDto(updated),
      location,
    }
  })

  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location: result.location,
    action: 'updated',
    listIds: result.location ? [result.location.listId] : [],
  })
  return result.card
}

export async function deleteCard(input: { userId: string; cardId: string }): Promise<void> {
  const location = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    const currentLocation = await workspaceLocationForCard(card, tx)

    await tx.card.update({
      where: { id: input.cardId },
      data: softDeletedBy(input.userId),
    })
    return currentLocation
  })

  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location,
    action: 'deleted',
    listIds: location ? [location.listId] : [],
  })
}

export async function reorderCard(
  input: {
    userId: string
    cardId: string
    beforeCardId?: string | null
    afterCardId?: string | null
  },
) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    if (!card.list_id) throw new BadRequestError('Cannot reorder inbox cards')
    const location = await workspaceLocationForCard(card, tx)

    const siblings = await tx.card.findMany({
      where: {
        list_id: card.list_id,
        deleted_at: null,
        id: { not: input.cardId },
      },
      orderBy: { sequence: 'asc' },
    })

    const newSequence = computeSequence(
      siblings,
      input.beforeCardId,
      input.afterCardId,
    )
    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: { sequence: newSequence, ...updatedBy(input.userId) },
    })
    return {
      card: toCardDto(updated),
      location,
    }
  })

  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location: result.location,
    action: 'moved',
    listIds: result.location ? [result.location.listId] : [],
  })
  return result.card
}

export async function moveCard(
  input: {
    userId: string
    cardId: string
    targetListId: string
    beforeCardId?: string | null
    afterCardId?: string | null
  },
) {
  const result = await prisma.$transaction(async (tx) => {
    const lockedTarget = await tx.$queryRaw<
      Array<{ id: string; workspace_id: string }>
    >`
      SELECT "id", "workspace_id"
      FROM "Lists"
      WHERE "id" = ${input.targetListId}::uuid
        AND "deleted_at" IS NULL
      FOR UPDATE
    `
    const targetList = lockedTarget[0]
    if (!targetList) throw new NotFoundError()

    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)

    let sourceListId: string | null = null
    if (card.list_id !== null) {
      const sourceList = await getListOrThrow(card.list_id, tx)
      if (sourceList.workspace_id !== targetList.workspace_id) {
        throw new BadRequestError('Cards cannot be moved between workspaces')
      }
      sourceListId = sourceList.id
    }
    await requireWorkspaceRole(
      targetList.workspace_id,
      input.userId,
      'MEMBER',
      tx,
    )

    if (card.list_id === null) {
      const detachedRelation = softDeletedBy(input.userId)
      await tx.cardMember.updateMany({
        where: { card_id: input.cardId, deleted_at: null },
        data: detachedRelation,
      })
      await tx.cardLabel.updateMany({
        where: { card_id: input.cardId, deleted_at: null },
        data: detachedRelation,
      })
    }

    const siblings = await tx.card.findMany({
      where: {
        list_id: input.targetListId,
        deleted_at: null,
        id: { not: input.cardId },
      },
      orderBy: { sequence: 'asc' },
    })
    const newSequence = computeSequence(
      siblings,
      input.beforeCardId,
      input.afterCardId,
    )

    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: {
        list_id: input.targetListId,
        sequence: newSequence,
        ...updatedBy(input.userId),
      },
    })
    return {
      card: toCardDto(updated),
      workspaceId: targetList.workspace_id,
      sourceListId,
      targetListId: targetList.id,
    }
  })

  const listIds = [
    ...(result.sourceListId ? [result.sourceListId] : []),
    result.targetListId,
  ].filter((listId, index, values) => values.indexOf(listId) === index)
  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location: {
      workspaceId: result.workspaceId,
      listId: result.targetListId,
    },
    action: result.sourceListId ? 'moved' : 'created',
    listIds,
  })
  return result.card
}

export async function updateCardDates(
  input: {
    userId: string
    cardId: string
    startAt?: string | null
    deadline?: string | null
  },
) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    const location = await workspaceLocationForCard(card, tx)

    const newStart =
      'startAt' in input ? input.startAt : card.start_at?.toISOString() ?? null
    const newEnd =
      'deadline' in input ? input.deadline : card.deadline?.toISOString() ?? null
    if (newStart && newEnd && new Date(newStart) > new Date(newEnd)) {
      throw new BadRequestError('start_at must be before or equal to deadline')
    }

    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: {
        ...('startAt' in input
          ? { start_at: input.startAt ? new Date(input.startAt) : null }
          : {}),
        ...('deadline' in input
          ? { deadline: input.deadline ? new Date(input.deadline) : null }
          : {}),
        ...updatedBy(input.userId),
      },
    })
    return {
      card: toCardDto(updated),
      location,
    }
  })

  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location: result.location,
    action: 'updated',
    listIds: result.location ? [result.location.listId] : [],
  })
  return result.card
}

export async function updateCardCompletion(input: {
  userId: string
  cardId: string
  isCompleted: boolean
}) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    const location = await workspaceLocationForCard(card, tx)

    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: {
        is_completed: input.isCompleted,
        ...updatedBy(input.userId),
      },
    })
    return {
      card: toCardDto(updated),
      location,
      changed: card.is_completed !== input.isCompleted,
    }
  })

  if (result.changed) {
    publishCardChange({
      userId: input.userId,
      cardId: input.cardId,
      location: result.location,
      action: 'updated',
      listIds: result.location ? [result.location.listId] : [],
    })
  }
  return result.card
}

export async function moveCardToInbox(input: { userId: string; cardId: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    const location = await workspaceLocationForCard(card, tx)

    const detachedRelation = softDeletedBy(input.userId)
    await tx.cardMember.updateMany({
      where: { card_id: input.cardId, deleted_at: null },
      data: detachedRelation,
    })
    await tx.cardLabel.updateMany({
      where: { card_id: input.cardId, deleted_at: null },
      data: detachedRelation,
    })
    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: {
        list_id: null,
        user_id: input.userId,
        ...updatedBy(input.userId),
      },
    })
    return {
      card: toCardDto(updated),
      location,
    }
  })

  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location: result.location,
    action: 'deleted',
    listIds: result.location ? [result.location.listId] : [],
  })
  return result.card
}

// ─── Card Members ─────────────────────────────────────────────

export async function addCardMember(input: {
  userId: string
  cardId: string
  targetUserId: string
}) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    if (!card.list_id) {
      throw new BadRequestError('Cannot assign members to inbox cards')
    }

    const list = await getListOrThrow(card.list_id, tx)
    const targetRole = await getWorkspaceRole(
      list.workspace_id,
      input.targetUserId,
      tx,
    )
    if (!targetRole) throw new BadRequestError('Target user is not a member of this workspace')

    const existing = await tx.cardMember.findUnique({
      where: {
        card_id_user_id: { card_id: input.cardId, user_id: input.targetUserId },
      },
    })
    if (existing && !existing.deleted_at) {
      throw new ConflictError('User is already assigned to this card')
    }

    if (existing) {
      await tx.cardMember.update({
        where: {
          card_id_user_id: { card_id: input.cardId, user_id: input.targetUserId },
        },
        data: restoredBy(input.userId),
      })
    } else {
      await tx.cardMember.create({
        data: {
          card_id: input.cardId,
          user_id: input.targetUserId,
          ...createdBy(input.userId),
        },
      })
    }

    const user = await tx.user.findFirst({
      where: { id: input.targetUserId, deleted_at: null },
    })
    if (!user) throw new NotFoundError()
    return {
      member: {
        user_id: input.targetUserId,
        name: user.name,
        profile_image_url: user.profile_image_url,
      },
      location: {
        workspaceId: list.workspace_id,
        listId: list.id,
      },
    }
  })

  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location: result.location,
    action: 'updated',
  })
  return result.member
}

export async function removeCardMember(input: {
  userId: string
  cardId: string
  targetUserId: string
}): Promise<void> {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)
  const location = await workspaceLocationForCard(card)

  const existing = await prisma.cardMember.findUnique({
    where: {
      card_id_user_id: { card_id: input.cardId, user_id: input.targetUserId },
    },
  })
  if (!existing || existing.deleted_at) throw new NotFoundError()

  await prisma.cardMember.update({
    where: {
      card_id_user_id: { card_id: input.cardId, user_id: input.targetUserId },
    },
    data: softDeletedBy(input.userId),
  })

  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location,
    action: 'updated',
  })
}

// ─── Attachments ──────────────────────────────────────────────

export async function addAttachment(
  input: {
    userId: string
    cardId: string
    file: Express.Multer.File
  },
) {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)
  const location = await workspaceLocationForCard(card)

  const attachment = await prisma.attachment.create({
    data: {
      card_id: input.cardId,
      storage_key: input.file.filename,
      file_name: input.file.originalname,
      mime_type: input.file.mimetype,
      size_bytes: input.file.size,
      ...createdBy(input.userId),
    },
  })
  const dto = toAttachmentDto(attachment)
  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location,
    action: 'updated',
  })
  return dto
}

export async function getAttachmentFile(input: {
  userId: string
  attachmentId: string
}): Promise<{ absolutePath: string; fileName: string; mimeType: string | null }> {
  const attachment = await prisma.attachment.findFirst({
    where: { id: input.attachmentId, deleted_at: null },
  })
  if (!attachment || !attachment.storage_key) throw new NotFoundError()
  const card = await getCardOrThrow(attachment.card_id)
  await requireCardRole(card, input.userId)

  return {
    absolutePath: path.join(UPLOAD_DIR, 'attachments', attachment.storage_key),
    fileName: attachment.file_name ?? 'file',
    mimeType: attachment.mime_type,
  }
}

export async function removeAttachment(input: {
  userId: string
  attachmentId: string
}): Promise<void> {
  const attachment = await prisma.attachment.findFirst({
    where: { id: input.attachmentId, deleted_at: null },
  })
  if (!attachment) throw new NotFoundError()
  const card = await getCardOrThrow(attachment.card_id)
  await requireCardWrite(card, input.userId)
  const location = await workspaceLocationForCard(card)

  await prisma.attachment.update({
    where: { id: input.attachmentId },
    data: softDeletedBy(input.userId),
  })
  if (attachment.storage_key) {
    await deleteUploadedFile('attachments', attachment.storage_key)
  }

  publishCardChange({
    userId: input.userId,
    cardId: card.id,
    location,
    action: 'updated',
  })
}

// ─── Comments ─────────────────────────────────────────────────

export async function createComment(input: {
  userId: string
  cardId: string
  comment: string
}) {
  const card = await getCardOrThrow(input.cardId)
  await requireCardRole(card, input.userId)
  const location = await workspaceLocationForCard(card)

  const comment = await prisma.comment.create({
    data: {
      card_id: input.cardId,
      user_id: input.userId,
      comment_str: input.comment,
      ...createdBy(input.userId),
    },
    include: { user: { select: userSummarySelect } },
  })
  const dto = toCommentDto(comment)
  publishCardChange({
    userId: input.userId,
    cardId: input.cardId,
    location,
    action: 'updated',
  })
  return dto
}

export async function updateComment(input: {
  userId: string
  commentId: string
  comment: string
}) {
  const comment = await prisma.comment.findFirst({
    where: { id: input.commentId, deleted_at: null },
  })
  if (!comment) throw new NotFoundError()
  if (comment.user_id !== input.userId) throw new ForbiddenError()
  const card = await getCardOrThrow(comment.card_id)
  const location = await workspaceLocationForCard(card)

  const updated = await prisma.comment.update({
    where: { id: input.commentId },
    data: {
      comment_str: input.comment,
      ...updatedBy(input.userId),
    },
    include: { user: { select: userSummarySelect } },
  })
  const dto = toCommentDto(updated)
  publishCardChange({
    userId: input.userId,
    cardId: comment.card_id,
    location,
    action: 'updated',
  })
  return dto
}

export async function deleteComment(input: {
  userId: string
  commentId: string
}): Promise<void> {
  const comment = await prisma.comment.findFirst({
    where: { id: input.commentId, deleted_at: null },
  })
  if (!comment) throw new NotFoundError()
  const card = await getCardOrThrow(comment.card_id)

  if (comment.user_id !== input.userId) {
    if (!card.list_id) throw new ForbiddenError()
    const list = await getListOrThrow(card.list_id)
    await requireWorkspaceRole(list.workspace_id, input.userId, 'ADMIN')
  }
  const location = await workspaceLocationForCard(card)

  await prisma.comment.update({
    where: { id: input.commentId },
    data: softDeletedBy(input.userId),
  })

  publishCardChange({
    userId: input.userId,
    cardId: comment.card_id,
    location,
    action: 'updated',
  })
}
