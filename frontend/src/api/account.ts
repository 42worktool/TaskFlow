import { apiRequest, authState, invalidateAuthenticatedSession, type AuthUser } from '../services/auth'
import { uploadFile } from '../services/fileTransfer'

export const AccountAPI = {
  update: async (name: string): Promise<AuthUser> => {
    const user = await apiRequest<AuthUser>('/api/auth/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name }),
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
