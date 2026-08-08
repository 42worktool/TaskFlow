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
  // 공개 필드만 명시적으로 선택해 이메일 같은 계정 정보가 프로필 응답에 섞이지 않게 한다.
  const profile = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
    select: publicProfileSelect,
  })

  if (!profile) throw new NotFoundError('Profile not found')
  return toPublicProfileDto(profile)
}
