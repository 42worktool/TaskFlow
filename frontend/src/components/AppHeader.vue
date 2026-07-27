<script setup lang="ts">
import NotificationMenu from './NotificationMenu.vue'
import ProfileMenu from './ProfileMenu.vue'
import SearchInput from './SearchInput.vue'

withDefaults(
  defineProps<{
    workspaceName?: string
    initialQuery?: string
    showInbox?: boolean
  }>(),
  { workspaceName: '', initialQuery: '', showInbox: true },
)

const emit = defineEmits<{ openInbox: [] }>()
</script>

<template>
  <header class="app-topbar" :class="{ 'app-topbar--workspace': workspaceName }">
    <RouterLink to="/workspaces" class="app-topbar-logo">TaskFlow</RouterLink>
    <span v-if="workspaceName" class="app-topbar-workspace">{{ workspaceName }}</span>
    <div class="app-topbar-main">
      <SearchInput :initial-query="initialQuery" />
      <div class="app-topbar-actions">
        <NotificationMenu />
        <button
          v-if="showInbox"
          class="app-topbar-button"
          type="button"
          @click="emit('openInbox')"
        >
          인박스
        </button>
        <ProfileMenu />
      </div>
    </div>
  </header>
</template>

<style scoped src="../styles/app-header.css"></style>
