<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { WorkspaceAPI } from '../api/workspace'
import { authState, initializeAuth } from '../services/auth'

const route = useRoute()
const router = useRouter()
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  await initializeAuth()

  if (!authState.user) {
    router.replace({ path: '/signin', query: { redirect: route.fullPath } })
    return
  }

  const token = route.params.token as string
  if (!token) {
    error.value = '유효하지 않은 초대 링크입니다.'
    loading.value = false
    return
  }

  try {
    const ws = await WorkspaceAPI.acceptInvite(token)
    router.replace(`/workspaces/${ws.id}/board`)
  } catch (e: any) {
    error.value = e.message || '초대 수락에 실패했습니다.'
    loading.value = false
  }
})
</script>

<template>
  <div class="accept-invite">
    <template v-if="loading">
      <p>초대를 처리하는 중입니다...</p>
    </template>
    <template v-else-if="error">
      <p class="error">{{ error }}</p>
      <RouterLink to="/workspaces" class="home-link">워크스페이스로 이동</RouterLink>
    </template>
  </div>
</template>

<style scoped>
.accept-invite {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-size: 1.125rem;
}
.error {
  color: #ef4444;
  margin-bottom: 1rem;
}
.home-link {
  color: #2563eb;
  text-decoration: underline;
}
</style>
