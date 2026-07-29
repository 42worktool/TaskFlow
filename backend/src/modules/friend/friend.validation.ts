import { z } from 'zod'

export const friendRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict()

export const friendUserIdSchema = z.string().uuid().toLowerCase()
