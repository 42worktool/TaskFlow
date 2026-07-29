<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import InboxDrawer from '../components/InboxDrawer.vue'
import LegalFooter from '../components/LegalFooter.vue'
import WorkspaceFormModal from '../components/WorkspaceFormModal.vue'
import { WorkspaceAPI } from '../api/workspace'
import { authState } from '../services/auth'
import { workspaceColor } from '../types'
import type { Workspace } from '../types'
import {
  hasWorkspaceRole,
  workspaceRoleFor,
} from '../utils/workspacePermissions'

const showInbox = ref(false)
const showCreate = ref(false)
const myWorkspaces = ref<Workspace[]>([])
const openWorkspaces = ref<Workspace[]>([])

const editing = ref<Workspace | null>(null)
const menuOpen = ref<string | null>(null)
const workspaceSections = computed(() => [
  {
    key: 'mine',
    title: '내 프로젝트',
    description: '소속된 비공개 프로젝트',
    workspaces: myWorkspaces.value,
    editable: true,
  },
  {
    key: 'public',
    title: '공개 프로젝트',
    description: '누구나 참여할 수 있는 오픈 프로젝트',
    workspaces: openWorkspaces.value,
    editable: false,
  },
])

async function refreshList() {
  const data = await WorkspaceAPI.list()
  myWorkspaces.value = data.my
  openWorkspaces.value = data.public
}

function onSaved(ws: Workspace) {
  if (!editing.value) {
    myWorkspaces.value.unshift(ws)
    return
  }
  const idx = myWorkspaces.value.findIndex((w) => w.id === ws.id)
  if (idx !== -1) myWorkspaces.value[idx] = ws
  const idx2 = openWorkspaces.value.findIndex((w) => w.id === ws.id)
  if (idx2 !== -1) openWorkspaces.value[idx2] = ws
}

function toggleMenu(wsId: string) {
  menuOpen.value = menuOpen.value === wsId ? null : wsId
}

function canEditWorkspace(ws: Workspace): boolean {
  return hasWorkspaceRole(
    workspaceRoleFor(ws, authState.user?.id),
    'ADMIN',
  )
}

function canDeleteWorkspace(ws: Workspace): boolean {
  return workspaceRoleFor(ws, authState.user?.id) === 'OWNER'
}

function hasWorkspaceMenu(ws: Workspace): boolean {
  return canEditWorkspace(ws) || canDeleteWorkspace(ws)
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
    <AppHeader @open-inbox="showInbox = true" />

    <div class="home-body">
      <!-- Content -->
      <main class="home-content">
        <section
          v-for="section in workspaceSections"
          v-show="section.editable || section.workspaces.length"
          :key="section.key"
          class="project-section"
        >
          <h2 class="section-title">{{ section.title }}</h2>
          <p class="section-desc">{{ section.description }}</p>
          <div class="project-grid">
            <div
              v-for="ws in section.workspaces"
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
              <button
                v-if="hasWorkspaceMenu(ws)"
                class="card-menu-btn"
                type="button"
                @click.stop="toggleMenu(ws.id)"
              >
                ⋯
              </button>
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
            <div
              v-if="section.editable"
              class="project-card project-card--new"
              @click="showCreate = true"
            >
              <div class="new-card-inner">
                <span class="new-icon">+</span>
                <span class="new-label">새 프로젝트 추가</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <div class="home-footer">
      <LegalFooter variant="light" />
    </div>

    <InboxDrawer :open="showInbox" @close="showInbox = false" />
    <WorkspaceFormModal
      v-if="showCreate"
      @close="showCreate = false"
      @saved="onSaved"
    />
    <WorkspaceFormModal
      v-if="editing"
      :workspace="editing"
      @close="editing = null"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped src="../styles/workspace-home.css"></style>
