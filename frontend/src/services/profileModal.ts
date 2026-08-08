// 공개 프로필과 내 계정 편집이 동시에 열리지 않도록 하나의 전역 표면 상태로 관리한다.
// 메시지·검색 등 어느 화면에서도 동일한 모달을 열 수 있게 호출 지점을 분리했다.
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
