<script setup lang="ts">
import ProfileMenu from './ProfileMenu.vue'
import SearchInput from './SearchInput.vue'

withDefaults(
  defineProps<{
    workspaceName?: string
    initialQuery?: string
  }>(),
  { workspaceName: '', initialQuery: '' },
)
</script>

<template>
  <header class="app-topbar" :class="{ 'app-topbar--workspace': workspaceName }">
    <RouterLink to="/workspaces" class="app-topbar-logo">TaskFlow</RouterLink>
    <span v-if="workspaceName" class="app-topbar-workspace">{{ workspaceName }}</span>
    <div class="app-topbar-main">
      <SearchInput :initial-query="initialQuery" />
      <div class="app-topbar-actions">
        <div
          v-if="$slots['workspace-actions']"
          class="app-topbar-workspace-actions"
        >
          <slot name="workspace-actions" />
        </div>
        <ProfileMenu />
      </div>
    </div>
  </header>
</template>

<style scoped src="../styles/app-header.css"></style>
