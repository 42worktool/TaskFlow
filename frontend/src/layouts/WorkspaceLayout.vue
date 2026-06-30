<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import InboxPanel from '../components/InboxPanel.vue'
import ShareModal from '../components/ShareModal.vue'
import { myWorkspaces, openWorkspaces, workspaceMembers, currentUser } from '../mock/data'

const route = useRoute()
const workspaceId = computed(() => String(route.params.workspaceId ?? ''))
const allWorkspaces = [...myWorkspaces, ...openWorkspaces]
const workspace = computed(
  () => allWorkspaces.find((w) => w.id === workspaceId.value) ?? myWorkspaces[0],
)

const showShareModal = ref(false)

const memberColors = ['#2563EB', '#10B981', '#7C3AED']
</script>

<template>
  <div class="app-shell">
    <!-- Header -->
    <header class="app-header">
      <RouterLink to="/workspaces" class="logo">TaskFlow</RouterLink>
      <span class="workspace-name">{{ workspace.name }}</span>
      <div class="header-right">
        <div class="user-avatar" :style="{ background: currentUser.avatar_color }">
          {{ currentUser.avatar }}
        </div>
        <button class="header-btn">팀원 관리</button>
        <button class="header-btn-outline" @click="showShareModal = true">공유</button>
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
        </div>
      </nav>

      <!-- Main view + Inbox -->
      <div class="main-with-inbox">
        <RouterView />
        <InboxPanel />
      </div>
    </div>

    <ShareModal
      v-if="showShareModal"
      :workspace-name="workspace.name"
      :workspace-id="workspaceId"
      @close="showShareModal = false"
    />
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-header {
  height: 52px;
  background: #1a3a6b;
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
  flex-shrink: 0;
}

.logo {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  text-decoration: none;
  margin-right: 8px;
}

.workspace-name {
  flex: 1;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.header-btn {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  color: #fff;
  cursor: pointer;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.header-btn-outline {
  padding: 6px 14px;
  background: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  overflow-y: auto;
}

.sidebar-workspace-name {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  padding: 0 16px 12px;
}

.sidebar-nav {
  list-style: none;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
  color: #374151;
  text-decoration: none;
  cursor: pointer;
  border-radius: 0;
}

.nav-item:hover {
  background: #f3f4f6;
}

.nav-item--active {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}

.nav-item--disabled {
  color: #9ca3af;
  cursor: default;
}

.nav-item--disabled:hover {
  background: none;
}

.nav-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}

.sidebar-team {
  margin-top: 20px;
  padding: 0 16px;
}

.team-label {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.team-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.team-member {
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.team-name {
  font-size: 13px;
  color: #374151;
}

.main-with-inbox {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
