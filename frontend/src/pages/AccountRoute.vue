<script setup lang="ts">
import { useRouter } from 'vue-router'
import Account from './Account.vue'

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
