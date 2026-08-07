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
  <header
    class="app-topbar h-13 flex items-center px-5 gap-4 shrink-0 max-sm:h-auto max-sm:min-h-13 max-sm:px-3 max-sm:py-2 max-sm:gap-2 max-sm:flex-wrap"
    :class="{ 'app-topbar--workspace': workspaceName }"
  >
    <RouterLink
      to="/workspaces"
      class="text-base font-bold text-white no-underline mr-2 whitespace-nowrap max-sm:mr-0"
    >
      TaskFlow
    </RouterLink>
    <span
      v-if="workspaceName"
      class="app-topbar-workspace flex-1 min-w-30 font-semibold text-white max-sm:min-w-0"
    >
      {{ workspaceName }}
    </span>
    <div class="app-topbar-main flex-1 min-w-0 flex items-center gap-2.5">
      <SearchInput :initial-query="initialQuery" />
      <div class="flex items-center gap-2.5 ml-auto min-w-0 max-sm:gap-1.5">
        <div
          v-if="$slots['workspace-actions']"
          class="app-topbar-workspace-actions min-w-0 flex items-center gap-2"
        >
          <slot name="workspace-actions" />
        </div>
        <ProfileMenu />
      </div>
    </div>
  </header>
</template>

<style scoped src="../styles/app-header.css"></style>
