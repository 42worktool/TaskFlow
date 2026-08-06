import { z } from 'zod'
import { uuidSchema } from '../../lib/validation'

export const profileSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(80),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    workspace_id: uuidSchema.optional(),
  })
  .strict()
