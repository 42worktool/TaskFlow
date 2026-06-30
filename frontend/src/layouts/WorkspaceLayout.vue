<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import InboxDrawer from '../components/InboxDrawer.vue'
import NotificationMenu from '../components/NotificationMenu.vue'
import ProfileMenu from '../components/ProfileMenu.vue'
import SearchInput from '../components/SearchInput.vue'
import ShareModal from '../components/ShareModal.vue'
import { myWorkspaces, openWorkspaces, workspaceMembers } from '../mock/data'

const route = useRoute()
const workspaceId = computed(() => String(route.params.workspaceId ?? ''))
const allWorkspaces = [...myWorkspaces, ...openWorkspaces]
const workspace = computed(
  () => allWorkspaces.find((w) => w.id === workspaceId.value) ?? myWorkspaces[0],
)
const isBoardRoute = computed(() => route.path.endsWith('/board'))

const showShareModal = ref(false)
const showInbox = ref(false)

const memberColors = ['#2563EB', '#10B981', '#7C3AED']
</script>

<template>
  <div class="app-shell">
    <!-- Header -->
    <header class="app-header">
      <RouterLink to="/workspaces" class="logo">TaskFlow</RouterLink>
      <span class="workspace-name">{{ workspace.name }}</span>
      <div class="header-right">
        <SearchInput />
        <div class="header-actions">
          <NotificationMenu />
          <button v-if="!isBoardRoute" class="header-btn" type="button" @click="showInbox = true">
            인박스
          </button>
        </div>
        <div class="profile-slot">
          <ProfileMenu />
        </div>
      </div>
    </header>

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
            <li v-for="(m, i) in workspaceMembers" :key="m.user_id" class="team-member">
              <div
                class="team-avatar"
                :style="{ background: memberColors[i % memberColors.length] }"
              >
                {{ m.name[0] }}
              </div>
              <span class="team-name">{{ m.name }}</span>
            </li>
          </ul>
          <div class="sidebar-actions">
            <button class="sidebar-action-btn" type="button">팀원 관리</button>
            <button
              class="sidebar-action-btn sidebar-action-btn--primary"
              type="button"
              @click="showShareModal = true"
            >
              공유
            </button>
          </div>
        </div>
      </nav>

      <RouterView />
    </div>

    <ShareModal
      v-if="showShareModal"
      :workspace-name="workspace.name"
      :workspace-id="workspaceId"
      @close="showShareModal = false"
    />
    <InboxDrawer :open="showInbox" @close="showInbox = false" />
  </div>
</template>

<style scoped src="../styles/workspace-layout.css"></style>
