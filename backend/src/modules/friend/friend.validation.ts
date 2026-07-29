import { z } from 'zod'

export const addFriendSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict()

export const friendUserIdSchema = z.string().uuid().toLowerCase()
