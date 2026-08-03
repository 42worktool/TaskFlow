import type { Card, Label, Prisma } from '@prisma/client'
import { prisma } from '../../db'
import { BadRequestError, ConflictError, NotFoundError } from '../../errors'
import { createdBy, restoredBy, softDeletedBy } from '../../lib/audit'
import { requireWorkspaceReadAccess, requireWorkspaceRole } from '../../lib/workspace-permissions'
import { publishWorkspaceChange } from '../workspace/workspace.realtime'
import { toLabelDto } from './label.dto'

type LabelClient = Pick<Prisma.TransactionClient, 'label' | 'cardLabel'>

type CardWithList = Card & {
  list: { id: string; workspace_id: string } | null
}

async function getLabelOrThrow(labelId: string, client: LabelClient = prisma): Promise<Label> {
  const label = await client.label.findFirst({
    where: { id: labelId, deleted_at: null },
  })
  if (!label) throw new NotFoundError()
  return label
}

async function getCardWithListOrThrow(cardId: string): Promise<CardWithList> {
  const card = await prisma.card.findFirst({
    where: { id: cardId, deleted_at: null },
    include: { list: { select: { id: true, workspace_id: true } } },
  })
  if (!card) throw new NotFoundError()
  return card
}

async function assertWorkspaceReadAccess(userId: string, workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, deleted_at: null },
    select: {
      is_public: true,
      members: {
        where: { user_id: userId, deleted_at: null },
        select: { user_id: true },
      },
    },
  })
  requireWorkspaceReadAccess(workspace, userId)
}

export async function listLabels(input: { userId: string; workspaceId: string }) {
  await assertWorkspaceReadAccess(input.userId, input.workspaceId)
  const labels = await prisma.label.findMany({
    where: { workspace_id: input.workspaceId, deleted_at: null },
    orderBy: { created_at: 'asc' },
  })
  return labels.map(toLabelDto)
}

export async function createLabel(input: {
  userId: string
  workspaceId: string
  labelName: string
  labelColor: string
}) {
  await requireWorkspaceRole(input.workspaceId, input.userId, 'MEMBER')
  const label = await prisma.label.create({
    data: {
      workspace_id: input.workspaceId,
      label_name: input.labelName,
      label_color: input.labelColor.toUpperCase(),
      ...createdBy(input.userId),
    },
  })
  publishWorkspaceChange({
    workspace_id: input.workspaceId,
    entity: 'workspace',
    action: 'updated',
    entity_id: input.workspaceId,
    list_ids: [],
    actor_user_id: input.userId,
  })
  return toLabelDto(label)
}

export async function deleteLabel(input: { userId: string; labelId: string }): Promise<void> {
  const label = await getLabelOrThrow(input.labelId)
  await requireWorkspaceRole(label.workspace_id, input.userId, 'MEMBER')
  await prisma.$transaction(async (tx) => {
    await tx.label.update({
      where: { id: label.id },
      data: softDeletedBy(input.userId),
    })
    await tx.cardLabel.updateMany({
      where: { label_id: label.id, deleted_at: null },
      data: softDeletedBy(input.userId),
    })
  })
  publishWorkspaceChange({
    workspace_id: label.workspace_id,
    entity: 'workspace',
    action: 'updated',
    entity_id: label.workspace_id,
    list_ids: [],
    actor_user_id: input.userId,
  })
}

async function getCardWorkspaceOrThrow(cardId: string): Promise<CardWithList> {
  const card = await getCardWithListOrThrow(cardId)
  if (!card.list) throw new BadRequestError('Cannot attach labels to inbox cards')
  return card
}

async function assertSameWorkspace(card: CardWithList, label: Label): Promise<string> {
  if (!card.list) throw new BadRequestError('Cannot attach labels to inbox cards')
  if (card.list.workspace_id !== label.workspace_id) {
    throw new BadRequestError('Card and label must belong to the same workspace')
  }
  return card.list.workspace_id
}

export async function addCardLabel(input: {
  userId: string
  cardId: string
  labelId: string
}) {
  const card = await getCardWorkspaceOrThrow(input.cardId)
  const label = await getLabelOrThrow(input.labelId)
  const workspaceId = await assertSameWorkspace(card, label)
  await requireWorkspaceRole(workspaceId, input.userId, 'MEMBER')

  await prisma.$transaction(async (tx) => {
    const existing = await tx.cardLabel.findUnique({
      where: { label_id_card_id: { label_id: label.id, card_id: card.id } },
    })
    if (existing?.deleted_at === null) {
      throw new ConflictError('Label is already attached to this card')
    }
    if (existing) {
      await tx.cardLabel.update({
        where: { label_id_card_id: { label_id: label.id, card_id: card.id } },
        data: restoredBy(input.userId),
      })
    } else {
      await tx.cardLabel.create({
        data: {
          label_id: label.id,
          card_id: card.id,
          ...createdBy(input.userId),
        },
      })
    }
  })

  publishWorkspaceChange({
    workspace_id: workspaceId,
    entity: 'card',
    action: 'updated',
    entity_id: card.id,
    list_ids: [card.list!.id],
    actor_user_id: input.userId,
  })
  return toLabelDto(label)
}

export async function removeCardLabel(input: {
  userId: string
  cardId: string
  labelId: string
}): Promise<void> {
  const card = await getCardWorkspaceOrThrow(input.cardId)
  const label = await getLabelOrThrow(input.labelId)
  const workspaceId = await assertSameWorkspace(card, label)
  await requireWorkspaceRole(workspaceId, input.userId, 'MEMBER')

  const existing = await prisma.cardLabel.findUnique({
    where: { label_id_card_id: { label_id: label.id, card_id: card.id } },
  })
  if (!existing || existing.deleted_at) throw new NotFoundError()
  await prisma.cardLabel.update({
    where: { label_id_card_id: { label_id: label.id, card_id: card.id } },
    data: softDeletedBy(input.userId),
  })

  publishWorkspaceChange({
    workspace_id: workspaceId,
    entity: 'card',
    action: 'updated',
    entity_id: card.id,
    list_ids: [card.list!.id],
    actor_user_id: input.userId,
  })
}
