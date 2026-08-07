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
  return workspaceRoleFor(ws, authState.user?.id) === 'OWNER' && ws.members.length === 1
}

function canLeaveWorkspace(ws: Workspace): boolean {
  const role = workspaceRoleFor(ws, authState.user?.id)
  return role !== null && (role !== 'OWNER' || ws.members.length > 1)
}

function leaveWorkspaceLabel(ws: Workspace): string {
  return workspaceRoleFor(ws, authState.user?.id) === 'OWNER' ? '소유권 위임 후 나가기' : '나가기'
}

function hasWorkspaceMenu(ws: Workspace): boolean {
  return workspaceRoleFor(ws, authState.user?.id) !== null
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

async function leaveWorkspace(ws: Workspace) {
  const role = workspaceRoleFor(ws, authState.user?.id)
  if (!role) return
  menuOpen.value = null

  if (role === 'OWNER' && ws.members.length > 1) {
    alert('팀원 관리에서 다른 구성원에게 소유권을 위임한 뒤 나갈 수 있습니다.')
    return
  }

  const prompt =
    role === 'OWNER'
      ? `"${ws.name}"에 혼자 남아 있습니다. 나가면 워크스페이스가 삭제됩니다. 계속하시겠습니까?`
      : `"${ws.name}" 프로젝트에서 나가시겠습니까?`
  if (!confirm(prompt)) return

  try {
    await WorkspaceAPI.leave(ws.id)
    memberWorkspaces.value = memberWorkspaces.value.filter((workspace) => workspace.id !== ws.id)
  } catch (caught) {
    alert(caught instanceof Error ? caught.message : '프로젝트에서 나가지 못했습니다.')
  }
}

onMounted(refreshList)
</script>

<template>
  <div
    class="home-shell h-screen flex flex-col overflow-hidden bg-gray-100 box-border"
    :class="{ 'home-shell--inbox-open': inboxOpen }"
    @click="menuOpen = null"
  >
    <!-- Header -->
    <AppHeader />

    <div class="home-body flex-1 flex min-h-0 overflow-hidden">
      <aside
        v-if="inboxOpen"
        id="workspace-inbox-panel"
        class="workspace-home-inbox w-82.5 min-w-70 shrink-0 grow-0 basis-82.5 flex min-h-0 overflow-hidden border-r border-gray-200 bg-white"
        aria-label="인박스"
      >
        <InboxCardsPanel :allow-drag="false" />
      </aside>

      <!-- Content -->
      <main class="home-content flex-1 overflow-y-auto">
        <div
          v-if="loadError"
          class="project-load-state project-load-state--error mx-auto p-6 flex items-center justify-between gap-4 border border-red-200 bg-white text-red-700"
          role="alert"
        >
          <span>{{ loadError }}</span>
          <button
            type="button"
            class="project-load-retry-btn shrink-0 grow-0 min-h-9 px-3 border border-red-200 bg-white text-red-700 font-semibold"
            @click="refreshList"
          >
            다시 시도
          </button>
        </div>
        <div
          v-else-if="loading"
          class="project-load-state mx-auto p-6 border border-gray-200 bg-white text-gray-500 text-sm"
          role="status"
        >
          프로젝트를 불러오는 중…
        </div>
        <template v-else>
          <section
            v-for="section in workspaceSections"
            :key="section.key"
            class="project-section mx-auto mb-10"
          >
            <div class="project-section-heading flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 class="section-title text-xl font-bold text-gray-900 mb-1">{{ section.title }}</h2>
                <p class="section-desc mb-0 text-gray-500">{{ section.description }}</p>
              </div>
              <span
                class="project-section-count inline-flex min-w-7.5 h-6.5 items-center justify-center px-2.25 rounded-full bg-gray-200 text-gray-600 text-xs font-bold"
                >{{ section.workspaces.length }}</span
              >
            </div>
            <div class="project-grid grid grid-cols-4 auto-rows-fr gap-4">
              <div
                v-for="ws in section.workspaces"
                :key="ws.id"
                class="project-card-wrapper group relative grid min-w-0"
              >
                <RouterLink
                  :to="`/workspaces/${ws.id}/board`"
                  class="project-card bg-white overflow-hidden border border-gray-200 no-underline text-inherit flex min-w-0 min-h-39 h-full flex-col transition hover:border-gray-300 hover:-translate-y-px"
                >
                  <div class="card-color-bar h-1.25 shrink-0 grow-0 basis-1.25" :style="{ background: workspaceColor(ws.id) }" />
                  <div class="card-body flex min-h-0 flex-1 flex-col items-start py-4 px-4.5">
                    <h3 class="card-name">{{ ws.name }}</h3>
                    <div class="card-badges flex flex-wrap gap-1.5">
                      <span
                        class="card-badge inline-flex min-h-6 items-center py-0.5 px-2 rounded text-xs font-medium leading-none"
                        :class="ws.is_public ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'"
                        >{{ ws.is_public ? '공개' : '비공개' }}</span
                      >
                      <span
                        class="card-badge inline-flex min-h-6 items-center py-0.5 px-2 rounded text-xs font-medium leading-none bg-violet-50 text-violet-700"
                      >
                        {{ workspaceRoleLabel(ws) }}
                      </span>
                    </div>
                    <div class="card-footer flex w-full justify-between items-center mt-auto pt-3">
                      <span class="card-members text-gray-500">멤버 {{ ws.members.length }}명</span>
                      <div class="card-footer-actions flex items-center gap-0.5">
                        <button
                          v-if="hasWorkspaceMenu(ws)"
                          class="card-menu-btn shrink-0 grow-0 w-7 h-7 border-none bg-transparent rounded-md text-base font-bold text-gray-500 cursor-pointer flex items-center justify-center leading-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-gray-100 hover:text-gray-900"
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
                  class="card-menu-dropdown absolute bottom-11 right-3 bg-white border border-gray-200 rounded-lg z-20 min-w-45 overflow-hidden"
                  @click.stop
                >
                  <button
                    v-if="canEditWorkspace(ws)"
                    class="card-menu-item block w-full py-2.5 px-3.5 border-none bg-white text-left cursor-pointer text-gray-700 whitespace-nowrap hover:bg-gray-50"
                    type="button"
                    @click="startEdit(ws)"
                  >
                    수정
                  </button>
                  <button
                    v-if="canDeleteWorkspace(ws)"
                    class="card-menu-item block w-full py-2.5 px-3.5 border-none bg-white text-left cursor-pointer text-red-500 whitespace-nowrap hover:bg-red-50"
                    type="button"
                    @click="removeWorkspace(ws)"
                  >
                    삭제
                  </button>
                  <button
                    v-if="canLeaveWorkspace(ws)"
                    class="card-menu-item block w-full py-2.5 px-3.5 border-none bg-white text-left cursor-pointer text-red-500 whitespace-nowrap hover:bg-red-50"
                    type="button"
                    @click="leaveWorkspace(ws)"
                  >
                    {{ leaveWorkspaceLabel(ws) }}
                  </button>
                </div>
              </div>
              <button
                v-if="section.editable"
                class="project-card project-card--new appearance-none w-full p-0 border-2 border-dashed border-gray-300 bg-neutral-50 cursor-pointer text-inherit"
                type="button"
                @click="showCreate = true"
              >
                <div class="new-card-inner w-full h-full min-h-38 flex flex-col items-center justify-center gap-1.5 text-gray-400">
                  <span class="new-icon leading-none">+</span>
                  <span class="new-label">새 프로젝트 추가</span>
                </div>
              </button>
            </div>
            <p
              v-if="!section.editable && section.workspaces.length === 0"
              class="project-section-empty mt-3 p-5 text-center border border-gray-200 bg-white text-gray-500"
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
