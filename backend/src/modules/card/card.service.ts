// ============================================================
// card.service.ts — Card (+ members, attachments, comments) business logic
//
// Mirrors workspace.service.ts conventions: Prisma singleton, soft delete
// via deleted_at, role checks via workspace ROLE_RANK. Cards with
// list_id === null are personal inbox cards; access to those is by
// ownership (user_id), not workspace role.
// ============================================================
import { prisma } from '../../db'
import type { Attachment, Card, Comment, List, Role } from '@prisma/client'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors'
import { ROLE_RANK, getRole } from '../workspace/workspace.service'

// ─── DTOs ─────────────────────────────────────────────────────

function toCardDto(card: Card) {
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

async function buildCardDetail(card: Card) {
  const [members, attachments] = await Promise.all([
    prisma.cardMember.findMany({
      where: { card_id: card.id, deleted_at: null },
      include: { user: { select: { id: true, name: true, profile_image_url: true } } },
    }),
    prisma.attachment.findMany({
      where: { card_id: card.id, deleted_at: null },
      orderBy: { created_at: 'asc' },
    }),
  ])

  return {
    ...toCardDto(card),
    members: members.map((m) => ({
      user_id: m.user.id,
      name: m.user.name,
      profile_image_url: m.user.profile_image_url,
    })),
    attachments: attachments.map(toAttachmentDto),
  }
}

function toAttachmentDto(a: Attachment) {
  return {
    id: a.id,
    card_id: a.card_id,
    file_url: a.file_url,
    file_name: a.file_name,
    created_at: a.created_at,
  }
}

function toCommentDto(c: Comment & { user: { id: string; name: string; profile_image_url: string | null } }) {
  return {
    id: c.id,
    card_id: c.card_id,
    author: {
      user_id: c.user.id,
      name: c.user.name,
      profile_image_url: c.user.profile_image_url,
    },
    comment_str: c.comment_str,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
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

// Fractional-indexing midpoint for reorder/move operations.
function computeSequence(siblings: Card[], beforeId?: string | null, afterId?: string | null): number {
  const before = beforeId ? siblings.find((c) => c.id === beforeId) : null
  const after = afterId ? siblings.find((c) => c.id === afterId) : null
  if (!before && !after) return (siblings[siblings.length - 1]?.sequence ?? 0) + 1
  if (!before) return after!.sequence - 1
  if (!after) return before.sequence + 1
  return (before.sequence + after.sequence) / 2
}

// ─── Cards ────────────────────────────────────────────────────

export async function createCard(
  userId: string,
  listId: string,
  data: { title: string; description?: string | null; start_at?: string | null; deadline?: string | null },
) {
  const list = await getListOrThrow(listId)
  const role = await getRole(list.workspace_id, userId)
  if (!role || ROLE_RANK[role] < ROLE_RANK.MEMBER) throw new ForbiddenError()

  const agg = await prisma.card.aggregate({
    where: { list_id: listId, deleted_at: null },
    _max: { sequence: true },
  })

  const card = await prisma.card.create({
    data: {
      list_id: listId,
      title: data.title,
      description: data.description ?? '',
      start_at: data.start_at ? new Date(data.start_at) : null,
      deadline: data.deadline ? new Date(data.deadline) : null,
      sequence: (agg._max.sequence ?? 0) + 1,
      created_by: userId,
      updated_by: userId,
    },
  })
  return toCardDto(card)
}

export async function getCard(userId: string, cardId: string) {
  const card = await getCardOrThrow(cardId)
  await requireCardRole(card, userId)
  return buildCardDetail(card)
}

export async function updateCard(
  userId: string,
  cardId: string,
  data: { title?: string; description?: string | null },
) {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...('description' in data ? { description: data.description ?? '' } : {}),
      updated_by: userId,
    },
  })
  return toCardDto(updated)
}

export async function deleteCard(userId: string, cardId: string): Promise<void> {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  await prisma.card.update({
    where: { id: cardId },
    data: { deleted_at: new Date(), deleted_by: userId, updated_by: userId },
  })
}

export async function reorderCard(
  userId: string,
  cardId: string,
  data: { before_card_id?: string | null; after_card_id?: string | null },
) {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)
  if (!card.list_id) throw new BadRequestError('Cannot reorder inbox cards')

  const siblings = await prisma.card.findMany({
    where: { list_id: card.list_id, deleted_at: null, id: { not: cardId } },
    orderBy: { sequence: 'asc' },
  })

  const newSequence = computeSequence(siblings, data.before_card_id, data.after_card_id)
  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { sequence: newSequence, updated_by: userId },
  })
  return toCardDto(updated)
}

export async function moveCard(
  userId: string,
  cardId: string,
  data: { list_id: string; before_card_id?: string | null; after_card_id?: string | null },
) {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  const targetList = await getListOrThrow(data.list_id)
  const targetRole = await getRole(targetList.workspace_id, userId)
  if (!targetRole || ROLE_RANK[targetRole] < ROLE_RANK.MEMBER) {
    throw new ForbiddenError()
  }

  const siblings = await prisma.card.findMany({
    where: { list_id: data.list_id, deleted_at: null, id: { not: cardId } },
    orderBy: { sequence: 'asc' },
  })
  const newSequence = computeSequence(siblings, data.before_card_id, data.after_card_id)

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { list_id: data.list_id, sequence: newSequence, updated_by: userId },
  })
  return toCardDto(updated)
}

export async function updateCardDates(
  userId: string,
  cardId: string,
  data: { start_at?: string | null; deadline?: string | null },
) {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  const newStart = 'start_at' in data ? data.start_at : card.start_at?.toISOString() ?? null
  const newEnd = 'deadline' in data ? data.deadline : card.deadline?.toISOString() ?? null
  if (newStart && newEnd && new Date(newStart) > new Date(newEnd)) {
    throw new BadRequestError('start_at must be before or equal to deadline')
  }

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: {
      ...('start_at' in data ? { start_at: data.start_at ? new Date(data.start_at) : null } : {}),
      ...('deadline' in data ? { deadline: data.deadline ? new Date(data.deadline) : null } : {}),
      updated_by: userId,
    },
  })
  return toCardDto(updated)
}

export async function moveCardToInbox(userId: string, cardId: string) {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { list_id: null, user_id: userId, updated_by: userId },
  })
  return toCardDto(updated)
}

// ─── Card Members ─────────────────────────────────────────────

export async function addCardMember(userId: string, cardId: string, targetUserId: string) {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  if (card.list_id) {
    const list = await getListOrThrow(card.list_id)
    const targetRole = await getRole(list.workspace_id, targetUserId)
    if (!targetRole) throw new BadRequestError('Target user is not a member of this workspace')
  }

  const existing = await prisma.cardMember.findUnique({
    where: { card_id_user_id: { card_id: cardId, user_id: targetUserId } },
  })
  if (existing && !existing.deleted_at) {
    throw new ConflictError('User is already assigned to this card')
  }

  if (existing) {
    await prisma.cardMember.update({
      where: { card_id_user_id: { card_id: cardId, user_id: targetUserId } },
      data: { deleted_at: null, deleted_by: null, updated_by: userId },
    })
  } else {
    await prisma.cardMember.create({
      data: { card_id: cardId, user_id: targetUserId, created_by: userId, updated_by: userId },
    })
  }

  const user = await prisma.user.findFirst({ where: { id: targetUserId, deleted_at: null } })
  if (!user) throw new NotFoundError()
  return { user_id: targetUserId, name: user.name, profile_image_url: user.profile_image_url }
}

export async function removeCardMember(userId: string, cardId: string, targetUserId: string): Promise<void> {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  const existing = await prisma.cardMember.findUnique({
    where: { card_id_user_id: { card_id: cardId, user_id: targetUserId } },
  })
  if (!existing || existing.deleted_at) throw new NotFoundError()

  await prisma.cardMember.update({
    where: { card_id_user_id: { card_id: cardId, user_id: targetUserId } },
    data: { deleted_at: new Date(), deleted_by: userId, updated_by: userId },
  })
}

// ─── Attachments ──────────────────────────────────────────────

export async function addAttachment(
  userId: string,
  cardId: string,
  data: { file_url: string; file_name: string },
) {
  const card = await getCardOrThrow(cardId)
  await requireCardWrite(card, userId)

  const attachment = await prisma.attachment.create({
    data: { card_id: cardId, file_url: data.file_url, file_name: data.file_name, created_by: userId, updated_by: userId },
  })
  return toAttachmentDto(attachment)
}

export async function removeAttachment(userId: string, attachmentId: string): Promise<void> {
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, deleted_at: null } })
  if (!attachment) throw new NotFoundError()
  const card = await getCardOrThrow(attachment.card_id)
  await requireCardWrite(card, userId)

  await prisma.attachment.update({
    where: { id: attachmentId },
    data: { deleted_at: new Date(), deleted_by: userId, updated_by: userId },
  })
}

// ─── Comments ─────────────────────────────────────────────────

export async function createComment(userId: string, cardId: string, data: { comment_str: string }) {
  const card = await getCardOrThrow(cardId)
  await requireCardRole(card, userId)

  const comment = await prisma.comment.create({
    data: { card_id: cardId, user_id: userId, comment_str: data.comment_str, created_by: userId, updated_by: userId },
    include: { user: { select: { id: true, name: true, profile_image_url: true } } },
  })
  return toCommentDto(comment)
}

export async function updateComment(userId: string, commentId: string, data: { comment_str: string }) {
  const comment = await prisma.comment.findFirst({ where: { id: commentId, deleted_at: null } })
  if (!comment) throw new NotFoundError()
  if (comment.user_id !== userId) throw new ForbiddenError()

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { comment_str: data.comment_str, updated_by: userId },
    include: { user: { select: { id: true, name: true, profile_image_url: true } } },
  })
  return toCommentDto(updated)
}

export async function deleteComment(userId: string, commentId: string): Promise<void> {
  const comment = await prisma.comment.findFirst({ where: { id: commentId, deleted_at: null } })
  if (!comment) throw new NotFoundError()

  if (comment.user_id !== userId) {
    const card = await getCardOrThrow(comment.card_id)
    if (!card.list_id) throw new ForbiddenError()
    const list = await getListOrThrow(card.list_id)
    const role = await getRole(list.workspace_id, userId)
    if (!role || ROLE_RANK[role] < ROLE_RANK.ADMIN) throw new ForbiddenError()
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { deleted_at: new Date(), deleted_by: userId, updated_by: userId },
  })
}
