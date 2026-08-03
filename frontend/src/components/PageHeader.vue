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
  <header class="page-header">
    <RouterLink :to="fallback" class="page-header-logo">TaskFlow</RouterLink>
    <button type="button" class="back-link" @click="goBack">← 돌아가기</button>
  </header>
</template>

<style scoped src="../styles/page-header.css"></style>
