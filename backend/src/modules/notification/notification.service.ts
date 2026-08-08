import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { userSummarySchema } from '../../lib/user-summary'
import { uuidSchema } from '../../lib/validation'
import { realtime } from '../../realtime'

const realtimeNotificationSchema = z
  .object({
    id: uuidSchema,
    category: z.enum(['MENTION', 'UPDATE']),
    kind: z.literal('workspace.member_joined'),
    text: z.string().min(1).max(250),
    created_at: z.string().datetime(),
    workspace_id: uuidSchema,
    actor: userSummarySchema,
  })
  .strict()

export type RealtimeNotification = z.infer<typeof realtimeNotificationSchema>

// 별도 알림 보관함 대신 메신저가 즉시 표시할 가벼운 이벤트를 만든다.
// 프로토타입 단계에서는 DB에 쌓지 않으므로 오프라인 사용자는 이 이벤트를 받지 못한다.
// 이후 일반 API에서 현재 워크스페이스 상태는 볼 수 있지만 놓친 알림을 복구하지는 않는다.

export function notifyWorkspaceMemberJoined(input: {
  recipientUserIds: string[]
  workspaceId: string
  workspaceName: string
  actor: {
    userId: string
    name: string
    profileImageUrl: string | null
  }
}): RealtimeNotification {
  const notification = realtimeNotificationSchema.parse({
    id: randomUUID(),
    category: 'UPDATE',
    kind: 'workspace.member_joined',
    text: `${input.actor.name}님이 ${input.workspaceName}에 참여했습니다.`,
    created_at: new Date().toISOString(),
    workspace_id: input.workspaceId,
    actor: {
      user_id: input.actor.userId,
      name: input.actor.name,
      profile_image_url: input.actor.profileImageUrl,
    },
  })

  // 행위자 자신을 제외한 기존 멤버에게만 참여 알림을 보낸다.
  realtime.sendToUsers(
    input.recipientUserIds.filter((userId) => userId !== input.actor.userId),
    'notification.created',
    notification,
  )

  return notification
}
