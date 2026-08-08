// 공통 채팅 제한을 사용해 DM 작성 요청의 입력 경계를 정의한다.
import { z } from 'zod'
import { messageContentSchema } from '../../lib/messaging'

export const createDirectMessageSchema = z
  .object({
    content: messageContentSchema,
  })
  .strict()
