import { prisma } from '../../db'
import { NotFoundError } from '../../errors'
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
