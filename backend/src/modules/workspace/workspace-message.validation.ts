import { z } from 'zod'
import { messageContentSchema } from '../../lib/messaging'
import { uuidSchema } from '../../lib/validation'

export const createWorkspaceMessageSchema = z
  .object({
    content: messageContentSchema,
    card_id: uuidSchema.nullable().optional(),
  })
  .strict()
