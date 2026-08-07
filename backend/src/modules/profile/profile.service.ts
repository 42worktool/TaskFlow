import { prisma } from '../../db'
import { NotFoundError } from '../../errors'
import { normalizedEmailSchema } from '../../lib/validation'
import { toPublicProfileDto } from './profile.dto'

const publicProfileSelect = {
  id: true,
  name: true,
  profile_image_url: true,
  headline: true,
  linkedin_url: true,
  created_at: true,
} as const

export async function getPublicProfile(userId: string) {
  const profile = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
    select: publicProfileSelect,
  })

  if (!profile) throw new NotFoundError('Profile not found')
  return toPublicProfileDto(profile)
}

export async function searchPublicProfiles(input: {
  query: string
  limit: number
  workspaceId?: string
}) {
  const normalizedQuery = input.query.trim()
  const parsedEmail = normalizedEmailSchema.safeParse(normalizedQuery)
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const profiles = await prisma.user.findMany({
    where: {
      deleted_at: null,
      ...(input.workspaceId
        ? {
            memberships: {
              some: {
                workspace_id: input.workspaceId,
                deleted_at: null,
                workspace: { deleted_at: null },
              },
            },
          }
        : {}),
      ...(parsedEmail.success
        ? { email: { equals: parsedEmail.data, mode: 'insensitive' as const } }
        : {
            AND: terms.map((term) => ({
              OR: [
                { name: { contains: term, mode: 'insensitive' as const } },
                { headline: { contains: term, mode: 'insensitive' as const } },
              ],
            })),
          }),
    },
    select: publicProfileSelect,
    orderBy: [{ name: 'asc' }, { created_at: 'desc' }],
    take: input.limit,
  })

  return profiles.map(toPublicProfileDto)
}
