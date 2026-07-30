import type { DirectMessage, User } from '@prisma/client'
import { z } from 'zod'

const directMessageUserSelect = {
  id: true,
  name: true,
  profile_image_url: true,
} as const

export const directMessageInclude = {
  sender: { select: directMessageUserSelect },
  recipient: { select: directMessageUserSelect },
} as const

const directMessageParticipantSchema = z
  .object({
    user_id: z.string().uuid(),
    name: z.string().min(1),
    profile_image_url: z.string().nullable(),
  })
  .strict()

export const directMessageDtoSchema = z
  .object({
    id: z.string().uuid(),
    content: z.string().min(1).max(1000),
    created_at: z.string().datetime(),
    author: directMessageParticipantSchema,
    recipient: directMessageParticipantSchema,
  })
  .strict()

type DirectMessageWithUsers = DirectMessage & {
  sender: Pick<User, 'id' | 'name' | 'profile_image_url'>
  recipient: Pick<User, 'id' | 'name' | 'profile_image_url'>
}

export type DirectMessageDto = z.infer<typeof directMessageDtoSchema>

export function toDirectMessageDto(
  message: DirectMessageWithUsers,
): DirectMessageDto {
  return directMessageDtoSchema.parse({
    id: message.id,
    content: message.content,
    created_at: message.created_at.toISOString(),
    author: {
      user_id: message.sender.id,
      name: message.sender.name,
      profile_image_url: message.sender.profile_image_url,
    },
    recipient: {
      user_id: message.recipient.id,
      name: message.recipient.name,
      profile_image_url: message.recipient.profile_image_url,
    },
  })
}
