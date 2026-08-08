// DB 채팅 행과 작성자 정보를 실시간 전송에도 재사용할 메시지 DTO로 변환·검증한다.
import type { WorkspaceMessage } from '@prisma/client'
import { z } from 'zod'
import { messageBaseDtoSchema } from '../../lib/messaging'
import { toUserSummary, type SelectedUserSummary } from '../../lib/user-summary'
import { uuidSchema } from '../../lib/validation'

export const workspaceMessageDtoSchema = messageBaseDtoSchema
  .extend({
    workspace_id: uuidSchema,
    card_id: uuidSchema.nullable(),
  })
  .strict()

type WorkspaceMessageWithAuthor = WorkspaceMessage & {
  user: SelectedUserSummary
}

export type WorkspaceMessageDto = z.infer<typeof workspaceMessageDtoSchema>

export function toWorkspaceMessageDto(message: WorkspaceMessageWithAuthor): WorkspaceMessageDto {
  return workspaceMessageDtoSchema.parse({
    id: message.id,
    workspace_id: message.workspace_id,
    card_id: message.card_id,
    content: message.content,
    created_at: message.created_at.toISOString(),
    author: toUserSummary(message.user),
  })
}
