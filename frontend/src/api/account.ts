// 계정 정보와 아바타 변경을 인증 상태에 즉시 반영하는 API 경계다.
// 서버 응답을 authState에 다시 넣어 새로고침 없이 전역 사용자 UI가 같은 값을 보게 한다.
import {
  apiRequest,
  authState,
  invalidateAuthenticatedSession,
  type AuthUser,
} from '../services/auth'
import { uploadFile } from '../services/fileTransfer'

export const AccountAPI = {
  update: async (profile: {
    name: string
    headline: string
    linkedin_url: string | null
  }): Promise<AuthUser> => {
    const user = await apiRequest<AuthUser>('/api/auth/account', {
      method: 'PATCH',
      json: profile,
    })

    authState.user = user
    return user
  },

  delete: async (): Promise<void> => {
    await apiRequest<void>('/api/auth/account', { method: 'DELETE' })
    invalidateAuthenticatedSession()
  },

  uploadAvatar: async (file: File, onProgress?: (percent: number) => void): Promise<AuthUser> => {
    const user = await uploadFile<AuthUser>('/api/auth/account/avatar', file, onProgress)
    authState.user = user
    return user
  },

  removeAvatar: async (): Promise<AuthUser> => {
    const user = await apiRequest<AuthUser>('/api/auth/account/avatar', { method: 'DELETE' })
    authState.user = user
    return user
  },
}
