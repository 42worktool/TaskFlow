import { z } from 'zod'
import { userSummarySchema } from './user-summary'
import { uuidSchema } from './validation'

export const MESSAGE_HISTORY_LIMIT = 100
export const MESSAGE_MAX_LENGTH = 1000

export const messageContentSchema = z.string().trim().min(1).max(MESSAGE_MAX_LENGTH)

export const messageBaseDtoSchema = z
  .object({
    id: uuidSchema,
    content: z.string().min(1).max(MESSAGE_MAX_LENGTH),
    created_at: z.string().datetime(),
    author: userSummarySchema,
  })
  .strict()

export const newestMessageOrder = [{ created_at: 'desc' as const }, { id: 'desc' as const }]
