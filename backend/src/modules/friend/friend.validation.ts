import { z } from 'zod'
import { normalizedEmailSchema } from '../../lib/validation'

export const friendRequestSchema = z
  .object({
    email: normalizedEmailSchema,
  })
  .strict()
