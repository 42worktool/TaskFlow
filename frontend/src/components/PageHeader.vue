<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { authState } from '../services/auth'

const router = useRouter()
// 직접 URL로 들어와 브라우저 이전 기록이 없어도 사용자를 유효한 시작 화면으로 보낸다.
const fallback = computed(() => (authState.user ? '/workspaces' : '/signin'))

// 실제 이전 경로가 있으면 문맥을 보존하고, 없을 때만 인증 상태별 fallback을 사용한다.
function goBack() {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push(fallback.value)
  }
}
</script>

<template>
  <header class="max-w-190 mx-auto py-6 flex items-center justify-between">
    <RouterLink :to="fallback" class="text-blue-700 text-xl font-extrabold no-underline"
      >TaskFlow</RouterLink
    >
    <button
      type="button"
      class="border-none bg-transparent p-0 text-blue-700 text-sm cursor-pointer"
      @click="goBack"
    >
      ← 돌아가기
    </button>
  </header>
</template>
