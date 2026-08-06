import type { DirectMessage } from '@prisma/client'
import { z } from 'zod'
import { messageBaseDtoSchema } from '../../lib/messaging'
import {
  toUserSummary,
  userSummarySchema,
  userSummarySelect,
  type SelectedUserSummary,
} from '../../lib/user-summary'

export const directMessageInclude = {
  sender: { select: userSummarySelect },
  recipient: { select: userSummarySelect },
} as const

export const directMessageDtoSchema = messageBaseDtoSchema
  .extend({
    recipient: userSummarySchema,
  })
  .strict()

type DirectMessageWithUsers = DirectMessage & {
  sender: SelectedUserSummary
  recipient: SelectedUserSummary
}

export type DirectMessageDto = z.infer<typeof directMessageDtoSchema>

export function toDirectMessageDto(message: DirectMessageWithUsers): DirectMessageDto {
  return directMessageDtoSchema.parse({
    id: message.id,
    content: message.content,
    created_at: message.created_at.toISOString(),
    author: toUserSummary(message.sender),
    recipient: toUserSummary(message.recipient),
  })
}
