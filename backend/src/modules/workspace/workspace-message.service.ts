import { prisma } from '../../db'
import { NotFoundError } from '../../errors'
import { createdBy } from '../../lib/audit'
import { realtime } from '../../realtime'
import { requireRole } from './workspace.service'
import {
  toWorkspaceMessageDto,
  workspaceMessageDtoSchema,
  type WorkspaceMessageDto,
} from './workspace-message.dto'
import { publishWorkspaceChange, workspaceChannel } from './workspace.realtime'

const messageAuthorSelect = {
  id: true,
  name: true,
  profile_image_url: true,
} as const

function publishWorkspaceMessageCreated(message: WorkspaceMessageDto): void {
  try {
    const event = workspaceMessageDtoSchema.parse(message)
    realtime.publish(
      workspaceChannel(event.workspace_id),
      'workspace.message_created',
      event,
    )
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "workspace.message_created"',
      error instanceof Error ? error.message : error,
    )
  }
}

export async function listWorkspaceMessages(input: {
  userId: string
  workspaceId: string
}) {
  await requireRole(input.workspaceId, input.userId, 'VIEWER')

  const messages = await prisma.workspaceMessage.findMany({
    where: { workspace_id: input.workspaceId },
    include: { user: { select: messageAuthorSelect } },
    orderBy: [
      { created_at: 'desc' },
      { id: 'desc' },
    ],
    take: 100,
  })

  return messages.reverse().map(toWorkspaceMessageDto)
}

export async function createWorkspaceMessage(input: {
  userId: string
  workspaceId: string
  content: string
  cardId?: string | null
}) {
  await requireRole(input.workspaceId, input.userId, 'VIEWER')

  const cardId = input.cardId ?? null
  const dto = await prisma.$transaction(async (tx) => {
    if (cardId) {
      const card = await tx.card.findFirst({
        where: {
          id: cardId,
          deleted_at: null,
          list: {
            workspace_id: input.workspaceId,
            deleted_at: null,
            workspace: { deleted_at: null },
          },
        },
        select: { id: true },
      })
      if (!card) throw new NotFoundError()
    }

    const message = await tx.workspaceMessage.create({
      data: {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        card_id: cardId,
        content: input.content,
      },
      include: { user: { select: messageAuthorSelect } },
    })

    if (cardId) {
      await tx.comment.create({
        data: {
          card_id: cardId,
          user_id: input.userId,
          comment_str: input.content,
          ...createdBy(input.userId),
        },
      })
    }

    return toWorkspaceMessageDto(message)
  })

  publishWorkspaceMessageCreated(dto)
  if (cardId) {
    publishWorkspaceChange({
      workspace_id: input.workspaceId,
      entity: 'card',
      action: 'updated',
      entity_id: cardId,
      list_ids: [],
      actor_user_id: input.userId,
    })
  }
  return dto
}
