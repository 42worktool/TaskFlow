<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
const workspaceId = route.params.workspaceId
</script>

<template>
  <div class="workspace-layout">
    <nav>
      <RouterLink :to="`/workspaces/${workspaceId}/board`">Board</RouterLink>
      <RouterLink :to="`/workspaces/${workspaceId}/calendar`">Calendar</RouterLink>
    </nav>
    <main>
      <RouterView />
    </main>
  </div>
</template>
