// 인증 여부와 무관하게 열 수 있는 공개 프로필 API다.
// 일반 인증 API와 달리 공개 경로를 직접 호출하되 오류 문구 변환 규칙은 공유한다.
import { authRequestError } from '../services/auth'

export interface PublicProfile {
  id: string
  name: string
  profile_image_url: string | null
  headline: string
  linkedin_url: string | null
  created_at: string
}

export const ProfileAPI = {
  get: async (userId: string): Promise<PublicProfile> => {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}/profile`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw await authRequestError(response, '프로필을 불러오지 못했습니다.')
    }
    return response.json() as Promise<PublicProfile>
  },
}
