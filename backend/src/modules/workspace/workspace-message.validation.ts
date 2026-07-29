import { z } from 'zod'

export const createWorkspaceMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(1000),
  })
  .strict()
