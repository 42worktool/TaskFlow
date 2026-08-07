import { reactive } from 'vue'

type ProfileSurface = 'profile' | 'account' | null

export const profileModalState = reactive<{
  surface: ProfileSurface
  userId: string | null
}>({
  surface: null,
  userId: null,
})

export function openProfileModal(userId: string): void {
  if (!userId) return
  profileModalState.surface = 'profile'
  profileModalState.userId = userId
}

export function closeProfileModal(): void {
  if (profileModalState.surface !== 'profile') return
  closeProfileSurface()
}

export function openAccountModal(): void {
  profileModalState.surface = 'account'
  profileModalState.userId = null
}

export function closeAccountModal(): void {
  if (profileModalState.surface !== 'account') return
  closeProfileSurface()
}

export function closeProfileSurface(): void {
  profileModalState.surface = null
  profileModalState.userId = null
}
