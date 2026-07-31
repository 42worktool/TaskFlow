import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { uuidSchema } from './validation'

export const userSummarySelect = {
  id: true,
  name: true,
  profile_image_url: true,
} as const satisfies Prisma.UserSelect

export type SelectedUserSummary = Prisma.UserGetPayload<{
  select: typeof userSummarySelect
}>

export const userSummarySchema = z
  .object({
    user_id: uuidSchema,
    name: z.string().min(1).max(80),
    profile_image_url: z.string().nullable(),
  })
  .strict()

export type UserSummary = z.infer<typeof userSummarySchema>

export function toUserSummary(user: SelectedUserSummary): UserSummary {
  return {
    user_id: user.id,
    name: user.name,
    profile_image_url: user.profile_image_url,
  }
}
