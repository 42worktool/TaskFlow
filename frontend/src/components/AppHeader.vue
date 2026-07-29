<script setup lang="ts">
import NotificationMenu from './NotificationMenu.vue'
import ProfileMenu from './ProfileMenu.vue'
import SearchInput from './SearchInput.vue'
import {
  toggleUtilityDrawer,
  utilityDrawerState,
} from '../services/utilityDrawer'

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
        <button
          class="app-topbar-button"
          type="button"
          aria-controls="utility-drawer"
          :aria-expanded="utilityDrawerState.active === 'friends'"
          @click="toggleUtilityDrawer('friends')"
        >
          친구
        </button>
        <NotificationMenu />
        <button
          class="app-topbar-button"
          type="button"
          aria-controls="utility-drawer"
          :aria-expanded="utilityDrawerState.active === 'inbox'"
          @click="toggleUtilityDrawer('inbox')"
        >
          인박스
        </button>
        <ProfileMenu />
      </div>
    </div>
  </header>
</template>

<style scoped src="../styles/app-header.css"></style>
