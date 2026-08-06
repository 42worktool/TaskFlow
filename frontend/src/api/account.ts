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
