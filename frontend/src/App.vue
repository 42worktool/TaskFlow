<script setup lang="ts">
import UtilityDrawerHost from './components/UtilityDrawerHost.vue'
import { authState } from './services/auth'
import { utilityDrawerState } from './services/utilityDrawer'
</script>

<template>
  <div
    :inert="authState.user && utilityDrawerState.active ? true : undefined"
  >
    <RouterView />
  </div>
  <UtilityDrawerHost />
</template>
