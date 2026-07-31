import { z } from 'zod'
import { messageContentSchema } from '../../lib/messaging'

export const createDirectMessageSchema = z
  .object({
    content: messageContentSchema,
  })
  .strict()
