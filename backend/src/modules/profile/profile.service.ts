import { prisma } from '../../db'
import { NotFoundError } from '../../errors'
import { toPublicProfileDto } from './profile.dto'

export async function getPublicProfile(userId: string) {
  const profile = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
    select: {
      id: true,
      name: true,
      profile_image_url: true,
      headline: true,
      linkedin_url: true,
      created_at: true,
    },
  })

  if (!profile) throw new NotFoundError('Profile not found')
  return toPublicProfileDto(profile)
}
