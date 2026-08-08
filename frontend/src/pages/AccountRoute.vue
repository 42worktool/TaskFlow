<script setup lang="ts">
import { useRouter } from 'vue-router'
import Account from './Account.vue'

// 직접 접근 가능한 계정 URL을 모달 UI로 감싸고 닫기 동작을 브라우저 방문 기록과 연결한다.
const router = useRouter()

function closeAccount(): void {
  const previousRoute = window.history.state?.back
  if (typeof previousRoute === 'string' && previousRoute.length > 0) {
    router.back()
    return
  }

  void router.replace('/workspaces')
}
</script>

<template>
  <Account @close="closeAccount" />
</template>
