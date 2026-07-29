import { z } from 'zod'

export const createWorkspaceMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(1000),
    card_id: z.string().uuid().nullable().optional(),
  })
  .strict()
