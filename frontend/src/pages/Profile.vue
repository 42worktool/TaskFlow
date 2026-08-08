<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProfileCardModal from '../components/ProfileCardModal.vue'
import { authState } from '../services/auth'

// 공유 가능한 프로필 URL에서도 동일한 카드 모달을 사용하고, 닫을 때 유효한 이전 화면으로 복귀한다.
const route = useRoute()
const router = useRouter()
const userId = computed(() => String(route.params.userId ?? ''))

function closeProfile(): void {
  const previousRoute = window.history.state?.back
  if (typeof previousRoute === 'string' && previousRoute.length > 0) {
    router.back()
    return
  }
  void router.replace(authState.user ? '/workspaces' : '/signin')
}
</script>

<template>
  <ProfileCardModal :user-id="userId" @close="closeProfile" />
</template>
