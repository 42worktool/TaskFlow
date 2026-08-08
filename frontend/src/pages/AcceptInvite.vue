<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { WorkspaceAPI, type WorkspaceInvitationPreview } from '../api/workspace'
import { authState, logout } from '../services/auth'
import type { WorkspaceRole } from '../types'

// 초대 토큰을 먼저 미리보기로 검증해 대상과 역할을 보여준 뒤, 사용자의 명시적 수락으로 멤버십을 만든다.
// 로그인 계정이 초대 대상과 다르면 같은 토큰 URL을 보존한 채 계정을 전환할 수 있게 한다.
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
  // 로그아웃 뒤에도 초대 링크로 돌아오도록 현재 전체 경로를 redirect에 보관한다.
  const redirect = route.fullPath
  await logout().catch(() => undefined)
  await router.replace({ path: '/signin', query: { redirect } })
}
</script>

<template>
  <div class="accept-invite flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <section
      class="invite-card w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
    >
      <template v-if="loading">
        <p class="mt-4 text-sm leading-6 text-slate-600">초대 정보를 불러오는 중입니다…</p>
      </template>
      <template v-else-if="error && !invitation">
        <p class="text-sm font-semibold text-blue-600">워크스페이스 초대</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">초대를 확인할 수 없습니다</h1>
        <p class="error mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-left text-red-700" role="alert">
          {{ error }}
        </p>
        <div class="mt-6 flex flex-col gap-3">
          <RouterLink
            to="/workspaces"
            class="accept-button rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 bg-blue-600 text-white hover:bg-blue-700"
            >워크스페이스로 이동</RouterLink
          >
        </div>
      </template>
      <template v-else-if="invitation">
        <p class="text-sm font-semibold text-blue-600">워크스페이스 초대</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">{{ invitation.workspace_name }}</h1>
        <p v-if="invitation.already_member" class="mt-4 text-sm leading-6 text-slate-600">
          이미 <strong>{{ currentRoleLabel }}</strong> 역할로 참여 중입니다. 현재 권한은 변경되지
          않습니다.
        </p>
        <p v-else class="mt-4 text-sm leading-6 text-slate-600">
          현재 로그인한 TaskFlow 계정으로 <strong>{{ roleLabel }}</strong> 역할에 참여합니다.
        </p>
        <div class="my-6 flex flex-col rounded-xl bg-slate-100 px-4 py-3 text-left">
          <span class="text-xs text-slate-500">현재 계정</span>
          <strong class="mt-1 text-sm text-slate-900">{{ authState.user?.name }}</strong>
          <small class="text-xs text-slate-500">{{ authState.user?.email }}</small>
        </div>
        <p
          v-if="error"
          class="error mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-left text-red-700"
          role="alert"
        >
          {{ error }}
        </p>
        <div class="mt-6 flex flex-col gap-3">
          <button
            class="accept-button rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 bg-blue-600 text-white hover:bg-blue-700"
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
            class="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            type="button"
            :disabled="accepting"
            @click="switchAccount"
          >
            다른 계정으로 로그인
          </button>
          <RouterLink to="/workspaces" class="text-sm text-slate-500 hover:text-slate-700"
            >취소</RouterLink
          >
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped src="../styles/accept-invite.css"></style>
