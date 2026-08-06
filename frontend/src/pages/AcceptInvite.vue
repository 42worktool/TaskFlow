<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { WorkspaceAPI, type WorkspaceInvitationPreview } from '../api/workspace'
import { authState, logout } from '../services/auth'
import type { WorkspaceRole } from '../types'

const route = useRoute()
const router = useRouter()
const error = ref('')
const loading = ref(true)
const accepting = ref(false)
const invitation = ref<WorkspaceInvitationPreview | null>(null)
const token = route.params.token as string
const roleLabels: Record<WorkspaceRole, string> = {
  OWNER: '소유자',
  ADMIN: '관리자',
  MEMBER: '멤버',
  VIEWER: '뷰어',
}
const roleLabel = computed(() => {
  return invitation.value ? roleLabels[invitation.value.role] : ''
})
const currentRoleLabel = computed(() => {
  return invitation.value?.current_role ? roleLabels[invitation.value.current_role] : ''
})

onMounted(async () => {
  try {
    invitation.value = await WorkspaceAPI.previewInvite(token)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '초대 수락에 실패했습니다.'
  } finally {
    loading.value = false
  }
})

async function acceptInvitation() {
  if (accepting.value) return
  error.value = ''
  accepting.value = true
  try {
    const workspace = await WorkspaceAPI.acceptInvite(token)
    await router.replace(`/workspaces/${workspace.id}/board`)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '초대 수락에 실패했습니다.'
    accepting.value = false
  }
}

async function switchAccount() {
  const redirect = route.fullPath
  await logout().catch(() => undefined)
  await router.replace({ path: '/signin', query: { redirect } })
}
</script>

<template>
  <div class="accept-invite">
    <section class="invite-card">
      <template v-if="loading">
        <p class="invite-status">초대 정보를 불러오는 중입니다…</p>
      </template>
      <template v-else-if="error && !invitation">
        <p class="invite-eyebrow">워크스페이스 초대</p>
        <h1>초대를 확인할 수 없습니다</h1>
        <p class="error" role="alert">{{ error }}</p>
        <div class="invite-actions">
          <RouterLink to="/workspaces" class="accept-button">워크스페이스로 이동</RouterLink>
        </div>
      </template>
      <template v-else-if="invitation">
        <p class="invite-eyebrow">워크스페이스 초대</p>
        <h1>{{ invitation.workspace_name }}</h1>
        <p v-if="invitation.already_member" class="invite-copy">
          이미 <strong>{{ currentRoleLabel }}</strong> 역할로 참여 중입니다. 현재 권한은 변경되지
          않습니다.
        </p>
        <p v-else class="invite-copy">
          현재 로그인한 TaskFlow 계정으로 <strong>{{ roleLabel }}</strong> 역할에 참여합니다.
        </p>
        <div class="account-summary">
          <span>현재 계정</span>
          <strong>{{ authState.user?.name }}</strong>
          <small>{{ authState.user?.email }}</small>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="invite-actions">
          <button
            class="accept-button"
            type="button"
            :disabled="accepting"
            @click="acceptInvitation"
          >
            {{
              accepting
                ? invitation.already_member
                  ? '이동하는 중…'
                  : '참여하는 중…'
                : invitation.already_member
                  ? '워크스페이스로 이동'
                  : '초대 수락'
            }}
          </button>
          <button
            class="secondary-button"
            type="button"
            :disabled="accepting"
            @click="switchAccount"
          >
            다른 계정으로 로그인
          </button>
          <RouterLink to="/workspaces" class="cancel-link">취소</RouterLink>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped src="../styles/accept-invite.css"></style>
