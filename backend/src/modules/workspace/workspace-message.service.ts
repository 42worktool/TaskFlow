import { prisma } from '../../db'
import { realtime } from '../../realtime'
import { requireRole } from './workspace.service'
import {
  toWorkspaceMessageDto,
  workspaceMessageDtoSchema,
  type WorkspaceMessageDto,
} from './workspace-message.dto'
import { workspaceChannel } from './workspace.realtime'

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
}) {
  await requireRole(input.workspaceId, input.userId, 'VIEWER')

  const message = await prisma.workspaceMessage.create({
    data: {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      content: input.content,
    },
    include: { user: { select: messageAuthorSelect } },
  })
  const dto = toWorkspaceMessageDto(message)
  publishWorkspaceMessageCreated(dto)
  return dto
}
