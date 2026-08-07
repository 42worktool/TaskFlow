import { apiRequest, authRequestError } from '../services/auth'

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

  search: (query: string, workspaceId?: string) =>
    apiRequest<PublicProfile[]>(
      `/api/users/search?q=${encodeURIComponent(query)}${
        workspaceId ? `&workspace_id=${encodeURIComponent(workspaceId)}` : ''
      }`,
    ),
}
