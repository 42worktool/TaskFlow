import type { User, WorkspaceMessage } from '@prisma/client'
import { z } from 'zod'

export const workspaceMessageDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    content: z.string().min(1).max(1000),
    created_at: z.string().datetime(),
    author: z
      .object({
        user_id: z.string().uuid(),
        name: z.string().min(1),
        profile_image_url: z.string().nullable(),
      })
      .strict(),
  })
  .strict()

type WorkspaceMessageWithAuthor = WorkspaceMessage & {
  user: Pick<User, 'id' | 'name' | 'profile_image_url'>
}

export type WorkspaceMessageDto = z.infer<typeof workspaceMessageDtoSchema>

export function toWorkspaceMessageDto(
  message: WorkspaceMessageWithAuthor,
): WorkspaceMessageDto {
  return workspaceMessageDtoSchema.parse({
    id: message.id,
    workspace_id: message.workspace_id,
    content: message.content,
    created_at: message.created_at.toISOString(),
    author: {
      user_id: message.user.id,
      name: message.user.name,
      profile_image_url: message.user.profile_image_url,
    },
  })
}
