<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import InboxCardsPanel from '../components/InboxCardsPanel.vue'
import WorkspaceFormModal from '../components/WorkspaceFormModal.vue'
import WorkspaceToolbox from '../components/WorkspaceToolbox.vue'
import { WorkspaceAPI } from '../api/workspace'
import { authState } from '../services/auth'
import { workspaceColor } from '../types'
import type { Workspace } from '../types'
import {
  hasWorkspaceRole,
  partitionWorkspacesByOwnership,
  workspaceRoleFor,
} from '../utils/workspacePermissions'

const showCreate = ref(false)
const inboxOpen = ref(false)
const memberWorkspaces = ref<Workspace[]>([])
const loading = ref(true)
const loadError = ref('')

const editing = ref<Workspace | null>(null)
const menuOpen = ref<string | null>(null)
const partitionedWorkspaces = computed(() =>
  partitionWorkspacesByOwnership(memberWorkspaces.value, authState.user?.id),
)
const workspaceSections = computed(() => [
  {
    key: 'mine',
    title: '내 프로젝트',
    description: '내가 만들고 소유하고 있는 프로젝트',
    emptyMessage: '아직 만든 프로젝트가 없습니다.',
    workspaces: partitionedWorkspaces.value.owned,
    editable: true,
  },
  {
    key: 'participating',
    title: '참여하고 있는 프로젝트',
    description: '초대받아 구성원으로 참여하고 있는 프로젝트',
    emptyMessage: '현재 참여하고 있는 다른 프로젝트가 없습니다.',
    workspaces: partitionedWorkspaces.value.participating,
    editable: false,
  },
])

async function refreshList() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await WorkspaceAPI.list()
    memberWorkspaces.value = data.my
  } catch (caught) {
    loadError.value =
      caught instanceof Error ? caught.message : '프로젝트 목록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function onSaved(ws: Workspace) {
  if (!editing.value) {
    memberWorkspaces.value.unshift(ws)
    return
  }
  const index = memberWorkspaces.value.findIndex((w) => w.id === ws.id)
  if (index !== -1) memberWorkspaces.value[index] = ws
}

function toggleMenu(wsId: string) {
  menuOpen.value = menuOpen.value === wsId ? null : wsId
}

function toggleInbox() {
  inboxOpen.value = !inboxOpen.value
}

function closeInbox() {
  inboxOpen.value = false
}

function canEditWorkspace(ws: Workspace): boolean {
  return hasWorkspaceRole(workspaceRoleFor(ws, authState.user?.id), 'ADMIN')
}

function canDeleteWorkspace(ws: Workspace): boolean {
  return workspaceRoleFor(ws, authState.user?.id) === 'OWNER'
}

function hasWorkspaceMenu(ws: Workspace): boolean {
  return canEditWorkspace(ws) || canDeleteWorkspace(ws)
}

function workspaceRoleLabel(ws: Workspace): string {
  const role = workspaceRoleFor(ws, authState.user?.id)
  return {
    OWNER: '소유자',
    ADMIN: '관리자',
    MEMBER: '멤버',
    VIEWER: '뷰어',
  }[role ?? 'VIEWER']
}

function startEdit(ws: Workspace) {
  if (!canEditWorkspace(ws)) return
  menuOpen.value = null
  editing.value = ws
}

async function removeWorkspace(ws: Workspace) {
  if (!canDeleteWorkspace(ws)) return
  menuOpen.value = null
  if (!confirm(`"${ws.name}" 프로젝트를 삭제하시겠습니까?`)) return
  try {
    await WorkspaceAPI.remove(ws.id)
    memberWorkspaces.value = memberWorkspaces.value.filter((workspace) => workspace.id !== ws.id)
  } catch {
    alert('삭제에 실패했습니다.')
  }
}

onMounted(refreshList)
</script>

<template>
  <div class="home-shell" :class="{ 'home-shell--inbox-open': inboxOpen }" @click="menuOpen = null">
    <!-- Header -->
    <AppHeader />

    <div class="home-body">
      <aside
        v-if="inboxOpen"
        id="workspace-inbox-panel"
        class="workspace-home-inbox"
        aria-label="인박스"
      >
        <InboxCardsPanel :allow-drag="false" />
      </aside>

      <!-- Content -->
      <main class="home-content">
        <div v-if="loadError" class="project-load-state project-load-state--error" role="alert">
          <span>{{ loadError }}</span>
          <button type="button" @click="refreshList">다시 시도</button>
        </div>
        <div v-else-if="loading" class="project-load-state" role="status">
          프로젝트를 불러오는 중…
        </div>
        <template v-else>
          <section v-for="section in workspaceSections" :key="section.key" class="project-section">
            <div class="project-section-heading">
              <div>
                <h2 class="section-title">{{ section.title }}</h2>
                <p class="section-desc">{{ section.description }}</p>
              </div>
              <span class="project-section-count">{{ section.workspaces.length }}</span>
            </div>
            <div class="project-grid">
              <div v-for="ws in section.workspaces" :key="ws.id" class="project-card-wrapper">
                <RouterLink :to="`/workspaces/${ws.id}/board`" class="project-card">
                  <div class="card-color-bar" :style="{ background: workspaceColor(ws.id) }" />
                  <div class="card-body">
                    <h3 class="card-name">{{ ws.name }}</h3>
                    <div class="card-badges">
                      <span
                        class="card-badge"
                        :class="ws.is_public ? 'card-badge--public' : 'card-badge--private'"
                        >{{ ws.is_public ? '공개' : '비공개' }}</span
                      >
                      <span class="card-badge card-badge--role">
                        {{ workspaceRoleLabel(ws) }}
                      </span>
                    </div>
                    <div class="card-footer">
                      <span class="card-members">멤버 {{ ws.members.length }}명</span>
                      <div class="card-footer-actions">
                        <button
                          v-if="hasWorkspaceMenu(ws)"
                          class="card-menu-btn"
                          type="button"
                          :aria-label="`${ws.name} 프로젝트 메뉴`"
                          :aria-expanded="menuOpen === ws.id"
                          @click.stop.prevent="toggleMenu(ws.id)"
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                  </div>
                </RouterLink>
                <div
                  v-if="hasWorkspaceMenu(ws) && menuOpen === ws.id"
                  class="card-menu-dropdown"
                  @click.stop
                >
                  <button
                    v-if="canEditWorkspace(ws)"
                    class="card-menu-item"
                    type="button"
                    @click="startEdit(ws)"
                  >
                    수정
                  </button>
                  <button
                    v-if="canDeleteWorkspace(ws)"
                    class="card-menu-item card-menu-item--danger"
                    type="button"
                    @click="removeWorkspace(ws)"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <button
                v-if="section.editable"
                class="project-card project-card--new"
                type="button"
                @click="showCreate = true"
              >
                <div class="new-card-inner">
                  <span class="new-icon">+</span>
                  <span class="new-label">새 프로젝트 추가</span>
                </div>
              </button>
            </div>
            <p
              v-if="!section.editable && section.workspaces.length === 0"
              class="project-section-empty"
            >
              {{ section.emptyMessage }}
            </p>
          </section>
        </template>
      </main>
    </div>

    <WorkspaceToolbox
      :inbox-open="inboxOpen"
      @toggle-inbox="toggleInbox"
      @close-inbox="closeInbox"
    />

    <WorkspaceFormModal v-if="showCreate" @close="showCreate = false" @saved="onSaved" />
    <WorkspaceFormModal
      v-if="editing"
      :workspace="editing"
      @close="editing = null"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped src="../styles/workspace-home.css"></style>
