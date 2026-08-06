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

  realtime.sendToUsers(
    input.recipientUserIds.filter((userId) => userId !== input.actor.userId),
    'notification.created',
    notification,
  )

  return notification
}
