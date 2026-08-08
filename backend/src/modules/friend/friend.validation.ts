// 이메일 기반 친구 요청을 공통 이메일 규칙으로 정규화·검증한다.
import { z } from 'zod'
import { normalizedEmailSchema } from '../../lib/validation'

export const friendRequestSchema = z
  .object({
    email: normalizedEmailSchema,
  })
  .strict()
