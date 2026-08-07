<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { authState } from '../services/auth'

const router = useRouter()
const fallback = computed(() => (authState.user ? '/workspaces' : '/signin'))

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
