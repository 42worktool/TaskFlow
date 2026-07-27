// ============================================================
// card.service.ts — Card (+ members, attachments, comments) business logic
//
// Mirrors workspace.service.ts conventions: Prisma singleton, soft delete
// via deleted_at, role checks via workspace ROLE_RANK. Cards with
// list_id === null are personal inbox cards; access to those is by
// ownership (user_id), not workspace role.
// ============================================================
import { prisma } from '../../db'
import type { Card, List, Role } from '@prisma/client'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors'
import { ROLE_RANK, getRole } from '../workspace/workspace.service'
import { createdBy, restoredBy, softDeletedBy, updatedBy } from '../../lib/audit'
import { computeSequence } from '../../lib/ordering'
import {
  toAttachmentDto,
  toCardDetailDto,
  toCardDto,
  toCommentDto,
} from './card.dto'

// ─── DTOs ─────────────────────────────────────────────────────

async function buildCardDetail(card: Card) {
  const [members, labels, attachments] = await Promise.all([
    prisma.cardMember.findMany({
      where: { card_id: card.id, deleted_at: null },
      include: { user: { select: { id: true, name: true, profile_image_url: true } } },
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
  ])

  return toCardDetailDto(card, members, labels, attachments)
}

// ─── Access helpers ───────────────────────────────────────────

async function getCardOrThrow(cardId: string): Promise<Card> {
  const card = await prisma.card.findFirst({ where: { id: cardId, deleted_at: null } })
  if (!card) throw new NotFoundError()
  return card
}

async function getListOrThrow(listId: string): Promise<List> {
  const list = await prisma.list.findFirst({ where: { id: listId, deleted_at: null } })
  if (!list) throw new NotFoundError()
  return list
}

/** Write access: inbox card owner, or MEMBER+ in the card's workspace. */
async function requireCardWrite(card: Card, userId: string): Promise<void> {
  await requireCardRole(card, userId, 'MEMBER')
}

async function requireCardRole(card: Card, userId: string, minRole?: Role): Promise<Role | null> {
  if (card.list_id === null) {
    if (card.user_id !== userId) throw new ForbiddenError()
    return null
  }
  const list = await getListOrThrow(card.list_id)
  const role = await getRole(list.workspace_id, userId)
  if (!role) throw new ForbiddenError()
  if (minRole && ROLE_RANK[role] < ROLE_RANK[minRole]) throw new ForbiddenError()
  return role
}

// ─── Cards ────────────────────────────────────────────────────

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
  const role = await getRole(list.workspace_id, input.userId)
  if (!role || ROLE_RANK[role] < ROLE_RANK.MEMBER) throw new ForbiddenError()

  const agg = await prisma.card.aggregate({
    where: { list_id: input.listId, deleted_at: null },
    _max: { sequence: true },
  })

  const card = await prisma.card.create({
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
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

  const updated = await prisma.card.update({
    where: { id: input.cardId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...('description' in input
        ? { description: input.description ?? '' }
        : {}),
      ...updatedBy(input.userId),
    },
  })
  return toCardDto(updated)
}

export async function deleteCard(input: { userId: string; cardId: string }): Promise<void> {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

  await prisma.card.update({
    where: { id: input.cardId },
    data: softDeletedBy(input.userId),
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
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)
  if (!card.list_id) throw new BadRequestError('Cannot reorder inbox cards')

  const siblings = await prisma.card.findMany({
    where: { list_id: card.list_id, deleted_at: null, id: { not: input.cardId } },
    orderBy: { sequence: 'asc' },
  })

  const newSequence = computeSequence(
    siblings,
    input.beforeCardId,
    input.afterCardId,
  )
  const updated = await prisma.card.update({
    where: { id: input.cardId },
    data: { sequence: newSequence, ...updatedBy(input.userId) },
  })
  return toCardDto(updated)
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
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

  const targetList = await getListOrThrow(input.targetListId)
  if (card.list_id !== null) {
    const sourceList = await getListOrThrow(card.list_id)
    if (sourceList.workspace_id !== targetList.workspace_id) {
      throw new BadRequestError('Cards cannot be moved between workspaces')
    }
  }
  const targetRole = await getRole(targetList.workspace_id, input.userId)
  if (!targetRole || ROLE_RANK[targetRole] < ROLE_RANK.MEMBER) {
    throw new ForbiddenError()
  }

  const siblings = await prisma.card.findMany({
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

  const updated = await prisma.card.update({
    where: { id: input.cardId },
    data: {
      list_id: input.targetListId,
      sequence: newSequence,
      ...updatedBy(input.userId),
    },
  })
  return toCardDto(updated)
}

export async function updateCardDates(
  input: {
    userId: string
    cardId: string
    startAt?: string | null
    deadline?: string | null
  },
) {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

  const newStart =
    'startAt' in input ? input.startAt : card.start_at?.toISOString() ?? null
  const newEnd =
    'deadline' in input ? input.deadline : card.deadline?.toISOString() ?? null
  if (newStart && newEnd && new Date(newStart) > new Date(newEnd)) {
    throw new BadRequestError('start_at must be before or equal to deadline')
  }

  const updated = await prisma.card.update({
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
  return toCardDto(updated)
}

export async function moveCardToInbox(input: { userId: string; cardId: string }) {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

  const updated = await prisma.card.update({
    where: { id: input.cardId },
    data: { list_id: null, user_id: input.userId, ...updatedBy(input.userId) },
  })
  return toCardDto(updated)
}

// ─── Card Members ─────────────────────────────────────────────

export async function addCardMember(input: {
  userId: string
  cardId: string
  targetUserId: string
}) {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

  if (card.list_id) {
    const list = await getListOrThrow(card.list_id)
    const targetRole = await getRole(list.workspace_id, input.targetUserId)
    if (!targetRole) throw new BadRequestError('Target user is not a member of this workspace')
  }

  const existing = await prisma.cardMember.findUnique({
    where: {
      card_id_user_id: { card_id: input.cardId, user_id: input.targetUserId },
    },
  })
  if (existing && !existing.deleted_at) {
    throw new ConflictError('User is already assigned to this card')
  }

  if (existing) {
    await prisma.cardMember.update({
      where: {
        card_id_user_id: { card_id: input.cardId, user_id: input.targetUserId },
      },
      data: restoredBy(input.userId),
    })
  } else {
    await prisma.cardMember.create({
      data: {
        card_id: input.cardId,
        user_id: input.targetUserId,
        ...createdBy(input.userId),
      },
    })
  }

  const user = await prisma.user.findFirst({
    where: { id: input.targetUserId, deleted_at: null },
  })
  if (!user) throw new NotFoundError()
  return {
    user_id: input.targetUserId,
    name: user.name,
    profile_image_url: user.profile_image_url,
  }
}

export async function removeCardMember(input: {
  userId: string
  cardId: string
  targetUserId: string
}): Promise<void> {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

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
}

// ─── Attachments ──────────────────────────────────────────────

export async function addAttachment(
  input: {
    userId: string
    cardId: string
    fileUrl: string
    fileName: string
  },
) {
  const card = await getCardOrThrow(input.cardId)
  await requireCardWrite(card, input.userId)

  const attachment = await prisma.attachment.create({
    data: {
      card_id: input.cardId,
      file_url: input.fileUrl,
      file_name: input.fileName,
      ...createdBy(input.userId),
    },
  })
  return toAttachmentDto(attachment)
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

  await prisma.attachment.update({
    where: { id: input.attachmentId },
    data: softDeletedBy(input.userId),
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

  const comment = await prisma.comment.create({
    data: {
      card_id: input.cardId,
      user_id: input.userId,
      comment_str: input.comment,
      ...createdBy(input.userId),
    },
    include: { user: { select: { id: true, name: true, profile_image_url: true } } },
  })
  return toCommentDto(comment)
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

  const updated = await prisma.comment.update({
    where: { id: input.commentId },
    data: {
      comment_str: input.comment,
      ...updatedBy(input.userId),
    },
    include: { user: { select: { id: true, name: true, profile_image_url: true } } },
  })
  return toCommentDto(updated)
}

export async function deleteComment(input: {
  userId: string
  commentId: string
}): Promise<void> {
  const comment = await prisma.comment.findFirst({
    where: { id: input.commentId, deleted_at: null },
  })
  if (!comment) throw new NotFoundError()

  if (comment.user_id !== input.userId) {
    const card = await getCardOrThrow(comment.card_id)
    if (!card.list_id) throw new ForbiddenError()
    const list = await getListOrThrow(card.list_id)
    const role = await getRole(list.workspace_id, input.userId)
    if (!role || ROLE_RANK[role] < ROLE_RANK.ADMIN) throw new ForbiddenError()
  }

  await prisma.comment.update({
    where: { id: input.commentId },
    data: softDeletedBy(input.userId),
  })
}
