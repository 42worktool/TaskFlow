import { prisma } from '../../db'
import { NotFoundError } from '../../errors'
import { createdBy } from '../../lib/audit'
import { MESSAGE_HISTORY_LIMIT, newestMessageOrder } from '../../lib/messaging'
import { userSummarySelect } from '../../lib/user-summary'
import { requireWorkspaceRole } from '../../lib/workspace-permissions'
import { realtime } from '../../realtime'
import {
  toWorkspaceMessageDto,
  workspaceMessageDtoSchema,
  type WorkspaceMessageDto,
} from './workspace-message.dto'
import { publishWorkspaceChange } from './workspace.realtime'

async function deliverWorkspaceMessageCreated(message: WorkspaceMessageDto): Promise<void> {
  try {
    // 채널 구독 여부와 무관하게 활성 멤버의 사용자 연결로 전송해
    // 다른 워크스페이스를 보고 있는 메신저도 새 메시지를 받을 수 있게 한다.
    const event = workspaceMessageDtoSchema.parse(message)
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspace_id: event.workspace_id,
        deleted_at: null,
      },
      select: { user_id: true },
    })
    realtime.sendToUsers(
      members.map((member) => member.user_id),
      'workspace.message_created',
      event,
    )
  } catch (error) {
    console.warn(
      '[realtime] failed to deliver "workspace.message_created"',
      error instanceof Error ? error.message : error,
    )
  }
}

export async function listWorkspaceMessages(input: { userId: string; workspaceId: string }) {
  await requireWorkspaceRole(input.workspaceId, input.userId, 'VIEWER')

  const messages = await prisma.workspaceMessage.findMany({
    where: { workspace_id: input.workspaceId },
    include: { user: { select: userSummarySelect } },
    orderBy: newestMessageOrder,
    take: MESSAGE_HISTORY_LIMIT,
  })

  // DB에서는 최신 N개만 효율적으로 자르고, 클라이언트에는 오래된 순으로 제공한다.
  return messages.reverse().map(toWorkspaceMessageDto)
}

export async function createWorkspaceMessage(input: {
  userId: string
  workspaceId: string
  content: string
  cardId?: string | null
}) {
  await requireWorkspaceRole(input.workspaceId, input.userId, 'VIEWER')

  const cardId = input.cardId ?? null
  // 카드가 첨부된 메시지는 동일 워크스페이스 카드인지 확인한 뒤
  // 채팅 메시지와 카드 댓글을 한 트랜잭션으로 생성해 두 기록이 어긋나지 않게 한다.
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
      include: { user: { select: userSummarySelect } },
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

  // DB 커밋 뒤 메시지를 전달하고, 카드 댓글이 생겼다면 보드에 부분 재조회 신호도 보낸다.
  await deliverWorkspaceMessageCreated(dto)
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
