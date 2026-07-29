<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import InboxDrawer from '../components/InboxDrawer.vue'
import ShareModal from '../components/ShareModal.vue'
import { WorkspaceAPI } from '../api/workspace'
import { authState } from '../services/auth'
import type { Workspace } from '../types'
import {
  hasWorkspaceRole,
  workspaceRoleFor,
} from '../utils/workspacePermissions'

const route = useRoute()
const workspaceId = computed(() => String(route.params.workspaceId ?? ''))
const workspace = ref<Workspace | null>(null)
const loadError = ref('')
const isBoardRoute = computed(() => route.path.endsWith('/board'))
const currentRole = computed(() =>
  workspace.value
    ? workspaceRoleFor(workspace.value, authState.user?.id)
    : null,
)
const canViewCardDetails = computed(() => currentRole.value !== null)
const canEditBoard = computed(() =>
  hasWorkspaceRole(currentRole.value, 'MEMBER'),
)
const canManageMembers = computed(() =>
  hasWorkspaceRole(currentRole.value, 'ADMIN'),
)

const showShareModal = ref(false)
const showInbox = ref(false)

const memberColors = ['#2563EB', '#10B981', '#7C3AED']

watch(
  workspaceId,
  async (id, _previousId, onCleanup) => {
    workspace.value = null
    loadError.value = ''
    showShareModal.value = false
    if (!id) return

    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    try {
      const loaded = await WorkspaceAPI.get(id)
      if (!cancelled) workspace.value = loaded
    } catch (caught) {
      if (!cancelled) {
        loadError.value =
          caught instanceof Error ? caught.message : '워크스페이스를 불러오지 못했습니다.'
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="workspace" class="app-shell">
    <!-- Header -->
    <AppHeader
      :workspace-name="workspace.name"
      :show-inbox="!isBoardRoute"
      @open-inbox="showInbox = true"
    />

    <div class="content-area">
      <!-- Sidebar -->
      <nav class="sidebar">
        <p class="sidebar-workspace-name">{{ workspace.name }}</p>
        <ul class="sidebar-nav">
          <li>
            <RouterLink
              :to="`/workspaces/${workspaceId}/board`"
              class="nav-item"
              active-class="nav-item--active"
            >
              <span class="nav-icon">⊞</span> 보드
            </RouterLink>
          </li>
          <li>
            <RouterLink
              :to="`/workspaces/${workspaceId}/calendar`"
              class="nav-item"
              active-class="nav-item--active"
            >
              <span class="nav-icon">▦</span> 달력
            </RouterLink>
          </li>
          <li>
            <span class="nav-item nav-item--disabled">
              <span class="nav-icon">⊟</span> 대시보드
            </span>
          </li>
          <li>
            <span class="nav-item nav-item--disabled">
              <span class="nav-icon">≡</span> 타임라인
            </span>
          </li>
        </ul>
        <div class="sidebar-team">
          <p class="team-label">팀원</p>
          <ul class="team-list">
            <li v-for="(m, i) in workspace.members" :key="m.user_id" class="team-member">
              <div
                class="team-avatar"
                :style="{ background: memberColors[i % memberColors.length] }"
              >
                {{ m.user.name[0] }}
              </div>
              <span class="team-name">{{ m.user.name }}</span>
            </li>
          </ul>
          <div v-if="canManageMembers" class="sidebar-actions">
            <button
              class="sidebar-action-btn sidebar-action-btn--primary"
              type="button"
              @click="showShareModal = true"
            >
              팀원 관리
            </button>
          </div>
        </div>
      </nav>

      <RouterView v-slot="{ Component }">
        <component
          :is="Component"
          :can-edit-board="canEditBoard"
          :can-view-card-details="canViewCardDetails"
        />
      </RouterView>
    </div>

    <ShareModal
      v-if="showShareModal && canManageMembers"
      :workspace-name="workspace.name"
      :workspace-id="workspaceId"
      :workspace="workspace"
      @close="showShareModal = false"
    />
    <InboxDrawer :open="showInbox" @close="showInbox = false" />
  </div>
  <div v-else class="app-shell">
    <AppHeader />
    <main class="workspace-load-state" :role="loadError ? 'alert' : 'status'">
      {{ loadError || '워크스페이스를 불러오는 중…' }}
    </main>
  </div>
</template>

<style scoped src="../styles/workspace-layout.css"></style>
