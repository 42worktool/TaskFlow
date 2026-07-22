<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import InboxDrawer from '../components/InboxDrawer.vue'
import LegalFooter from '../components/LegalFooter.vue'
import NotificationMenu from '../components/NotificationMenu.vue'
import ProfileMenu from '../components/ProfileMenu.vue'
import SearchInput from '../components/SearchInput.vue'
import CreateWorkspaceModal from '../components/CreateWorkspaceModal.vue'
import EditWorkspaceModal from '../components/EditWorkspaceModal.vue'
import { WorkspaceAPI } from '../api/workspace'
import { workspaceColor } from '../types'
import type { Workspace } from '../types'

const showInbox = ref(false)
const showCreate = ref(false)
const myWorkspaces = ref<Workspace[]>([])
const openWorkspaces = ref<Workspace[]>([])

const editing = ref<Workspace | null>(null)
const menuOpen = ref<string | null>(null)

async function refreshList() {
  const data = await WorkspaceAPI.list()
  myWorkspaces.value = data.my
  openWorkspaces.value = data.public
}

function onCreated(ws: Workspace) {
  myWorkspaces.value.unshift(ws)
}

function onUpdated(ws: Workspace) {
  const idx = myWorkspaces.value.findIndex((w) => w.id === ws.id)
  if (idx !== -1) myWorkspaces.value[idx] = ws
  const idx2 = openWorkspaces.value.findIndex((w) => w.id === ws.id)
  if (idx2 !== -1) openWorkspaces.value[idx2] = ws
}

function toggleMenu(wsId: string) {
  menuOpen.value = menuOpen.value === wsId ? null : wsId
}

function startEdit(ws: Workspace) {
  menuOpen.value = null
  editing.value = ws
}

async function removeWorkspace(ws: Workspace) {
  menuOpen.value = null
  if (!confirm(`"${ws.name}" 프로젝트를 삭제하시겠습니까?`)) return
  try {
    await WorkspaceAPI.remove(ws.id)
    myWorkspaces.value = myWorkspaces.value.filter((w) => w.id !== ws.id)
    openWorkspaces.value = openWorkspaces.value.filter((w) => w.id !== ws.id)
  } catch {
    alert('삭제에 실패했습니다.')
  }
}

onMounted(refreshList)
</script>

<template>
  <div class="home-shell" @click="menuOpen = null">
    <!-- Header -->
    <header class="home-header">
      <RouterLink to="/workspaces" class="logo">TaskFlow</RouterLink>
      <SearchInput />
      <div class="header-actions">
        <NotificationMenu />
        <button class="inbox-btn" type="button" @click="showInbox = true">인박스</button>
        <ProfileMenu />
      </div>
    </header>

    <div class="home-body">
      <!-- Content -->
      <main class="home-content">
        <!-- 내 프로젝트 -->
        <section class="project-section">
          <h2 class="section-title">내 프로젝트</h2>
          <p class="section-desc">소속된 비공개 프로젝트</p>
          <div class="project-grid">
            <div
              v-for="ws in myWorkspaces"
              :key="ws.id"
              class="project-card-wrapper"
            >
              <RouterLink
                :to="`/workspaces/${ws.id}/board`"
                class="project-card"
              >
                <div class="card-color-bar" :style="{ background: workspaceColor(ws.id) }" />
                <div class="card-body">
                  <h3 class="card-name">{{ ws.name }}</h3>
                  <span
                    class="card-badge"
                    :class="ws.is_public ? 'card-badge--public' : 'card-badge--private'"
                  >{{ ws.is_public ? '공개' : '비공개' }}</span>
                  <div class="card-footer">
                    <span class="card-members">멤버 {{ ws.members.length }}명</span>
                    <span class="card-arrow">→</span>
                  </div>
                </div>
              </RouterLink>
              <button class="card-menu-btn" type="button" @click.stop="toggleMenu(ws.id)">⋯</button>
              <div v-if="menuOpen === ws.id" class="card-menu-dropdown" @click.stop>
                <button class="card-menu-item" type="button" @click="startEdit(ws)">수정</button>
                <button class="card-menu-item card-menu-item--danger" type="button" @click="removeWorkspace(ws)">삭제</button>
              </div>
            </div>
            <div class="project-card project-card--new" @click="showCreate = true">
              <div class="new-card-inner">
                <span class="new-icon">+</span>
                <span class="new-label">새 프로젝트 추가</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 공개 프로젝트 -->
        <section v-if="openWorkspaces.length" class="project-section">
          <h2 class="section-title">공개 프로젝트</h2>
          <p class="section-desc">누구나 참여할 수 있는 오픈 프로젝트</p>
          <div class="project-grid">
            <RouterLink
              v-for="ws in openWorkspaces"
              :key="ws.id"
              :to="`/workspaces/${ws.id}/board`"
              class="project-card"
            >
              <div class="card-color-bar" :style="{ background: workspaceColor(ws.id) }" />
              <div class="card-body">
                <h3 class="card-name">{{ ws.name }}</h3>
                <span class="card-badge card-badge--public">공개</span>
                <div class="card-footer">
                  <span class="card-members">멤버 {{ ws.members.length }}명</span>
                  <span class="card-arrow">→</span>
                </div>
              </div>
            </RouterLink>
          </div>
        </section>
      </main>
    </div>

    <div class="home-footer">
      <LegalFooter variant="light" />
    </div>

    <InboxDrawer :open="showInbox" @close="showInbox = false" />
    <CreateWorkspaceModal
      v-if="showCreate"
      @close="showCreate = false"
      @created="onCreated"
    />
    <EditWorkspaceModal
      v-if="editing"
      :workspace="editing"
      @close="editing = null"
      @updated="onUpdated"
    />
  </div>
</template>

<style scoped src="../styles/workspace-home.css"></style>
