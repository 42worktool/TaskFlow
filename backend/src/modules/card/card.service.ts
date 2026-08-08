// ============================================================
// card.service.ts — 카드, 첨부 파일, 댓글 비즈니스 로직
//
// 워크스페이스 서비스와 같은 공용 Prisma, soft delete, 역할 검사를 사용한다.
// list_id가 null인 카드는 개인 인박스 카드이므로 워크스페이스 역할이 아니라
// user_id 소유권으로 접근을 판단한다. 이 두 상태의 전환이 카드 이동의 핵심이다.
// ============================================================
import path from 'node:path'
import { prisma } from '../../db'
import type { Card, List, Prisma, Role } from '@prisma/client'
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../../errors'
import { createdBy, softDeletedBy, updatedBy } from '../../lib/audit'
import { computeSequence } from '../../lib/ordering'
import { userSummarySelect } from '../../lib/user-summary'
import { UPLOAD_DIR, deleteUploadedFile } from '../../lib/upload'
import { getWorkspaceRole, requireWorkspaceRole } from '../../lib/workspace-permissions'
import { toAttachmentDto, toCardDetailDto, toCardDto, toCommentDto } from './card.dto'
import { publishWorkspaceChange } from '../workspace/workspace.realtime'

// ─── 상세 응답 조립

async function buildCardDetail(card: Card) {
  // 독립적인 레이블, 첨부 파일, 댓글은 병렬 조회해 상세 응답의 대기 시간을 줄인다.
  const [labels, attachments, comments] = await Promise.all([
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

  return toCardDetailDto(card, labels, attachments, comments)
}

// ─── 접근 권한 도우미

async function getCardOrThrow(cardId: string): Promise<Card> {
  const card = await prisma.card.findFirst({ where: { id: cardId, deleted_at: null } })
  if (!card) throw new NotFoundError()
  return card
}

type CardAccessClient = Pick<Prisma.TransactionClient, 'list' | 'workspaceMember'>

async function getListOrThrow(listId: string, client: CardAccessClient = prisma): Promise<List> {
  const list = await client.list.findFirst({
    where: { id: listId, deleted_at: null },
  })
  if (!list) throw new NotFoundError()
  return list
}

/** 쓰기는 인박스 카드 소유자 또는 카드가 속한 워크스페이스의 MEMBER 이상에게 허용한다. */
type CardAccess = Pick<Card, 'list_id' | 'user_id' | 'is_completed' | 'start_at' | 'deadline'>

interface WorkspaceCardLocation {
  workspaceId: string
  listId: string
}

async function lockCardOrThrow(tx: Prisma.TransactionClient, cardId: string): Promise<CardAccess> {
  // 수정/이동 전 행을 잠가 동시 요청이 같은 이전 위치와 상태를 기준으로 쓰지 않게 한다.
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
  // 개인 인박스와 워크스페이스 카드의 권한 모델을 이 경계에서 분기해
  // 나머지 카드 기능이 동일한 검사 함수를 재사용하게 한다.
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
  // 인박스 카드는 개인 화면만 갱신하면 되므로 워크스페이스 채널 이벤트를 발행하지 않는다.
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

// ─── 카드

export async function listInboxCards(input: { userId: string }) {
  const cards = await prisma.card.findMany({
    where: {
      list_id: null,
      user_id: input.userId,
      deleted_at: null,
    },
    orderBy: { updated_at: 'desc' },
  })
  return cards.map((card) => toCardDto(card))
}

export async function createCard(input: {
  userId: string
  listId: string
  title: string
  description?: string | null
  startAt?: string | null
  deadline?: string | null
}) {
  const list = await getListOrThrow(input.listId)
  await requireWorkspaceRole(list.workspace_id, input.userId, 'MEMBER')

  // 리스트 잠금 아래에서 마지막 순번 조회와 생성을 묶어 동시 생성의 sequence 충돌을 막는다.
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

export async function updateCard(input: {
  userId: string
  cardId: string
  title?: string
  description?: string | null
}) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    const location = await workspaceLocationForCard(card, tx)

    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...('description' in input ? { description: input.description ?? '' } : {}),
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

export async function reorderCard(input: {
  userId: string
  cardId: string
  beforeCardId?: string | null
  afterCardId?: string | null
}) {
  // 이웃 카드 ID로 중간 sequence를 계산해 전체 카드의 순번을 다시 쓰지 않는다.
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

    const newSequence = computeSequence(siblings, input.beforeCardId, input.afterCardId)
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

export async function moveCard(input: {
  userId: string
  cardId: string
  targetListId: string
  beforeCardId?: string | null
  afterCardId?: string | null
}) {
  const result = await prisma.$transaction(async (tx) => {
    // 목표 리스트와 카드를 잠근 상태에서 권한, 워크스페이스 경계, 새 순번을 검증한다.
    const lockedTarget = await tx.$queryRaw<Array<{ id: string; workspace_id: string }>>`
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
      // 카드 레이블과 권한 범위가 워크스페이스 기준이므로 공간 간 직접 이동은 금지한다.
      if (sourceList.workspace_id !== targetList.workspace_id) {
        throw new BadRequestError('Cards cannot be moved between workspaces')
      }
      sourceListId = sourceList.id
    }
    await requireWorkspaceRole(targetList.workspace_id, input.userId, 'MEMBER', tx)

    if (card.list_id === null) {
      // 인박스에서 복원할 때 과거 워크스페이스 레이블 관계가 남지 않게 방어적으로 정리한다.
      const detachedRelation = softDeletedBy(input.userId)
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
    const newSequence = computeSequence(siblings, input.beforeCardId, input.afterCardId)

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

export async function updateCardDates(input: {
  userId: string
  cardId: string
  startAt?: string | null
  deadline?: string | null
}) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCardOrThrow(tx, input.cardId)
    await requireCardWrite(card, input.userId, tx)
    const location = await workspaceLocationForCard(card, tx)

    // 부분 수정에서도 최종 시작/종료 값을 조합한 뒤 기간 순서를 검증한다.
    const newStart = 'startAt' in input ? input.startAt : (card.start_at?.toISOString() ?? null)
    const newEnd = 'deadline' in input ? input.deadline : (card.deadline?.toISOString() ?? null)
    if (newStart && newEnd && new Date(newStart) > new Date(newEnd)) {
      throw new BadRequestError('start_at must be before or equal to deadline')
    }

    const updated = await tx.card.update({
      where: { id: input.cardId },
      data: {
        ...('startAt' in input ? { start_at: input.startAt ? new Date(input.startAt) : null } : {}),
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

  // 실제 상태가 바뀐 경우에만 이벤트를 보내 불필요한 보드 재조회를 줄인다.
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

    // 워크스페이스 범위 레이블은 개인 인박스에 적용할 수 없어 이동과 함께 분리한다.
    const detachedRelation = softDeletedBy(input.userId)
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

// ─── 첨부 파일

export async function addAttachment(input: {
  userId: string
  cardId: string
  file: Express.Multer.File
}) {
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
  // 실제 파일 경로를 반환하기 전에 카드 접근 권한을 확인해 정적 파일 우회를 막는다.
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

  // DB에서 먼저 숨긴 뒤 파일을 지워 파일 삭제 실패가 접근 상태를 되돌리지 않게 한다.
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

// ─── 댓글

function commentAlreadyDeletedError(): AppError {
  return new AppError('COMMENT_ALREADY_DELETED', 409, '이 댓글은 삭제되었습니다.')
}

export async function createComment(input: { userId: string; cardId: string; comment: string }) {
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

export async function updateComment(input: { userId: string; commentId: string; comment: string }) {
  const comment = await prisma.comment.findFirst({
    where: { id: input.commentId },
  })
  if (!comment) throw new NotFoundError()
  if (comment.user_id !== input.userId) throw new ForbiddenError()
  if (comment.deleted_at) {
    throw commentAlreadyDeletedError()
  }
  const card = await getCardOrThrow(comment.card_id)
  await requireCardRole(card, input.userId)
  const location = await workspaceLocationForCard(card)

  // 사전 조회 뒤 삭제될 수 있어 updateMany의 deleted_at 조건과 count로 경쟁을 다시 확인한다.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.comment.updateMany({
      where: {
        id: input.commentId,
        user_id: input.userId,
        deleted_at: null,
      },
      data: {
        comment_str: input.comment,
        ...updatedBy(input.userId),
      },
    })
    if (result.count !== 1) {
      throw commentAlreadyDeletedError()
    }
    return tx.comment.findFirstOrThrow({
      where: { id: input.commentId },
      include: { user: { select: userSummarySelect } },
    })
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

export async function deleteComment(input: { userId: string; commentId: string }): Promise<void> {
  const comment = await prisma.comment.findFirst({
    where: { id: input.commentId },
  })
  if (!comment) throw new NotFoundError()
  const card = await getCardOrThrow(comment.card_id)

  // 작성자는 자기 댓글을, 워크스페이스 ADMIN은 다른 사용자의 댓글까지 관리할 수 있다.
  if (comment.user_id === input.userId) {
    await requireCardRole(card, input.userId)
  } else {
    if (!card.list_id) throw new ForbiddenError()
    const list = await getListOrThrow(card.list_id)
    await requireWorkspaceRole(list.workspace_id, input.userId, 'ADMIN')
  }
  if (comment.deleted_at) {
    throw commentAlreadyDeletedError()
  }
  const location = await workspaceLocationForCard(card)

  const result = await prisma.comment.updateMany({
    where: { id: input.commentId, deleted_at: null },
    data: softDeletedBy(input.userId),
  })
  if (result.count !== 1) {
    throw commentAlreadyDeletedError()
  }

  publishCardChange({
    userId: input.userId,
    cardId: comment.card_id,
    location,
    action: 'updated',
  })
}
