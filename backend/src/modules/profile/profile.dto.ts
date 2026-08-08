// 사용자 모델 중 공개 프로필에 허용된 필드만 응답 형태로 고정한다.
export interface PublicProfileRecord {
  id: string
  name: string
  profile_image_url: string | null
  headline: string
  linkedin_url: string | null
  created_at: Date
}

export function toPublicProfileDto(profile: PublicProfileRecord) {
  return {
    id: profile.id,
    name: profile.name,
    profile_image_url: profile.profile_image_url,
    headline: profile.headline,
    linkedin_url: profile.linkedin_url,
    created_at: profile.created_at.toISOString(),
  }
}
