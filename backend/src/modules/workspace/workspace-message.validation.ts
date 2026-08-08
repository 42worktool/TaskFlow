// 공통 메시지 제한과 선택 카드 ID를 사용해 워크스페이스 채팅 입력을 검증한다.
import { z } from 'zod'
import { messageContentSchema } from '../../lib/messaging'
import { uuidSchema } from '../../lib/validation'

export const createWorkspaceMessageSchema = z
  .object({
    content: messageContentSchema,
    card_id: uuidSchema.nullable().optional(),
  })
  .strict()
