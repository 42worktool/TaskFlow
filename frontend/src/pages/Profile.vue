<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProfileCardModal from '../components/ProfileCardModal.vue'
import { authState } from '../services/auth'

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
