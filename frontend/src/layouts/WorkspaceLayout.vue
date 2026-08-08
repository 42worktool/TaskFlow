<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import InboxCardsPanel from '../components/InboxCardsPanel.vue'
import ShareModal from '../components/ShareModal.vue'
import WorkspaceMembersMenu from '../components/WorkspaceMembersMenu.vue'
import WorkspaceLabelsMenu from '../components/WorkspaceLabelsMenu.vue'
import WorkspaceToolbox from '../components/WorkspaceToolbox.vue'
import { WorkspaceAPI } from '../api/workspace'
import { authState } from '../services/auth'
import {
  clearExternalCardDropHover,
  clearMessengerWorkspace,
  finishCardDrag,
  messengerState,
  notifyBoardChanged,
  notifyInboxChanged,
  setMessengerWorkspace,
  startCardDrag,
} from '../services/messenger'
import { realtime, RealtimeRequestError } from '../services/realtime'
import {
  parseWorkspaceChangedEvent,
  parseWorkspaceMemberPresenceEvent,
} from '../services/realtime/protocol'
import type { Card, Workspace, WorkspaceSubscriptionResult } from '../types'
import { hasWorkspaceRole, workspaceRoleFor } from '../utils/workspacePermissions'

// 워크스페이스 하위 화면이 공통으로 쓰는 권한, 멤버 현황, 인박스와 실시간 구독을 한곳에서 조율한다.
// 페이지마다 같은 구독을 중복하지 않고 RouterView에는 화면에 필요한 상태만 내려주기 위한 레이아웃 경계다.
const route = useRoute()
const router = useRouter()
const workspaceId = computed(() => String(route.params.workspaceId ?? ''))
const workspace = ref<Workspace | null>(null)
const loadError = ref('')
const onlineUserIds = ref<Set<string>>(new Set())
const workspaceSyncVersion = ref(0)
const currentRole = computed(() =>
  workspace.value ? workspaceRoleFor(workspace.value, authState.user?.id) : null,
)
const canViewCardDetails = computed(() => currentRole.value !== null)
const canEditBoard = computed(() => hasWorkspaceRole(currentRole.value, 'MEMBER'))
const canManageMembers = computed(() => hasWorkspaceRole(currentRole.value, 'ADMIN'))

const showShareModal = ref(false)
const inboxOpen = ref(false)
const compactViewport = ref(false)
const CARD_DRAG_PAGE_CLASS = 'is-card-dragging'
const CARD_DRAG_END_GRACE_MS = 250
let cardDragEndFallback: ReturnType<typeof setTimeout> | null = null
const inboxAcceptingBoardCard = computed(
  () => inboxOpen.value && canEditBoard.value && messengerState.cardDrag?.source === 'board',
)

// 카드 드래그 중 브라우저의 텍스트 선택을 막고, dragend가 유실돼도 전역 드래그 상태가 남지 않게 정리한다.
function setCardDragPageState(active: boolean): void {
  document.documentElement.classList.toggle(CARD_DRAG_PAGE_CLASS, active)
  document.body.classList.toggle(CARD_DRAG_PAGE_CLASS, active)
  if (active) document.getSelection()?.removeAllRanges()
}

function scheduleCardDragEndFallback(): void {
  if (!messengerState.cardDrag || cardDragEndFallback) return
  cardDragEndFallback = window.setTimeout(() => {
    cardDragEndFallback = null
    if (messengerState.cardDrag) finishCardDrag()
  }, CARD_DRAG_END_GRACE_MS)
}

function closeInbox(): void {
  if (messengerState.cardDrag) return
  inboxOpen.value = false
}

function toggleInbox(): void {
  if (messengerState.cardDrag) return
  if (inboxOpen.value) {
    closeInbox()
    return
  }

  inboxOpen.value = true
}

function applyWorkspaceUpdate(updated: Workspace): void {
  if (updated.id !== workspaceId.value) return
  workspace.value = updated
  workspaceSyncVersion.value += 1
}

function onInboxCardDragStart(card: Card): void {
  if (!canEditBoard.value || !inboxOpen.value) return
  startCardDrag(card.id, 'inbox')
}

function onInboxCardDragEnd(): void {
  finishCardDrag()
}

function onInboxDropSettled(): void {
  notifyBoardChanged()
  notifyInboxChanged()
}

function clearExternalDropOverWorkspace(event: DragEvent): void {
  const drag = messengerState.cardDrag
  const drop = messengerState.externalCardDrop
  if (drag?.source !== 'board' || !drop || drop.committed || drop.cardId !== drag.cardId) {
    return
  }
  const target = event.target
  if (target instanceof Element && target.closest('[data-card-drop-target]')) {
    return
  }
  clearExternalCardDropHover(drag.cardId, drop.owner)
}

function syncCompactViewport(): void {
  compactViewport.value = window.innerWidth <= 760
}

const SUBSCRIPTION_ATTEMPTS = 3
const SUBSCRIPTION_RETRY_DELAY_MS = 250
let workspaceLoadGeneration = 0
let presenceSequence = 0
let activeSubscriptionWorkspaceId: string | null = null
let messengerContextWorkspaceId: string | null = null
let removeSubscriptionRecovery: (() => void) | null = null
const livePresence = new Map<string, { online: boolean; sequence: number }>()

// 라우트가 빠르게 바뀔 때 늦게 끝난 요청이 새 워크스페이스를 덮지 않도록 세대 번호로 응답을 폐기한다.
async function loadWorkspace(id: string, reset: boolean): Promise<void> {
  const generation = ++workspaceLoadGeneration
  const attempts = reset ? 1 : 3
  if (reset) {
    workspace.value = null
    loadError.value = ''
    showShareModal.value = false
  }
  if (!id) return

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const loaded = await WorkspaceAPI.get(id)
      if (generation !== workspaceLoadGeneration || id !== workspaceId.value) {
        return
      }
      workspace.value = loaded
      loadError.value = ''
      return
    } catch (caught) {
      if (generation !== workspaceLoadGeneration || id !== workspaceId.value) {
        return
      }
      // 잘못된 ID, 접근 불가, 삭제된 워크스페이스는 루트로 복귀한다.
      if (
        caught instanceof Error &&
        ['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND'].includes(String(caught.cause))
      ) {
        void router.replace('/')
        return
      }
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, SUBSCRIPTION_RETRY_DELAY_MS)
        })
        continue
      }
      const message =
        caught instanceof Error ? caught.message : '워크스페이스를 불러오지 못했습니다.'
      if (reset || !workspace.value) {
        loadError.value = message
      } else {
        console.warn('[workspace] background refresh failed', message)
      }
    }
  }
}

function applyPresenceSnapshot(onlineIds: readonly string[], sequenceAtStart: number): void {
  // 구독 응답을 기다리는 동안 도착한 presence 이벤트를 스냅샷 위에 다시 적용해 최신 상태를 보존한다.
  const next = new Set(onlineIds)
  for (const [userId, presence] of livePresence) {
    if (presence.sequence <= sequenceAtStart) continue
    if (presence.online) next.add(userId)
    else next.delete(userId)
  }
  onlineUserIds.value = next
}

async function subscribeWorkspace(id: string): Promise<void> {
  const sequenceAtStart = presenceSequence
  let result: WorkspaceSubscriptionResult | null = null

  for (let attempt = 0; attempt < SUBSCRIPTION_ATTEMPTS; attempt += 1) {
    if (activeSubscriptionWorkspaceId !== id || workspaceId.value !== id || !realtime.isConnected) {
      return
    }

    try {
      result = await realtime.request('workspace.subscribe', {
        workspace_id: id,
      })
      break
    } catch (caught) {
      if (
        caught instanceof RealtimeRequestError &&
        caught.code === 'WORKSPACE_ACCESS_REQUIRED' &&
        activeSubscriptionWorkspaceId === id &&
        workspaceId.value === id
      ) {
        // 구독 권한이 사라졌다면 HTTP의 최신 멤버십을 기준으로 화면을 복구하거나 목록으로 돌려보낸다.
        try {
          const loaded = await WorkspaceAPI.get(id)
          if (activeSubscriptionWorkspaceId === id && workspaceId.value === id) {
            workspace.value = loaded
            loadError.value = ''
            workspaceSyncVersion.value += 1
          }
        } catch {
          if (activeSubscriptionWorkspaceId === id && workspaceId.value === id) {
            workspace.value = null
            stopWorkspaceSubscription()
            void router.replace('/workspaces')
          }
        }
        return
      }

      const canRetry =
        (!(caught instanceof RealtimeRequestError) || caught.retryable) &&
        attempt + 1 < SUBSCRIPTION_ATTEMPTS
      if (!canRetry) throw caught
      await new Promise((resolve) => {
        setTimeout(resolve, SUBSCRIPTION_RETRY_DELAY_MS)
      })
    }
  }
  if (!result) return

  if (activeSubscriptionWorkspaceId !== id || workspaceId.value !== id) {
    if (realtime.isConnected) {
      void realtime.request('workspace.unsubscribe', { workspace_id: id }).catch(() => undefined)
    }
    return
  }

  applyPresenceSnapshot(result.online_user_ids, sequenceAtStart)
  await loadWorkspace(id, false)
  if (activeSubscriptionWorkspaceId === id && workspaceId.value === id) {
    workspaceSyncVersion.value += 1
  }
}

function stopWorkspaceSubscription(): void {
  const previousWorkspaceId = activeSubscriptionWorkspaceId
  activeSubscriptionWorkspaceId = null
  removeSubscriptionRecovery?.()
  removeSubscriptionRecovery = null
  onlineUserIds.value = new Set()
  livePresence.clear()

  if (previousWorkspaceId && realtime.isConnected) {
    void realtime
      .request('workspace.unsubscribe', {
        workspace_id: previousWorkspaceId,
      })
      .catch(() => undefined)
  }
}

function startWorkspaceSubscription(id: string): void {
  if (activeSubscriptionWorkspaceId === id) return
  stopWorkspaceSubscription()
  activeSubscriptionWorkspaceId = id
  removeSubscriptionRecovery = realtime.registerSubscriptionRecovery(`workspace:${id}`, () =>
    subscribeWorkspace(id),
  )
}

const removeWorkspaceChangeListener = realtime.on('workspace.changed', (value) => {
  const event = parseWorkspaceChangedEvent(value)
  if (!event || event.workspace_id !== workspaceId.value) return

  if (event.entity === 'workspace' && event.action === 'deleted') {
    stopWorkspaceSubscription()
    void router.replace('/workspaces')
    return
  }
  if (
    event.entity === 'member' &&
    event.action === 'deleted' &&
    event.entity_id === authState.user?.id
  ) {
    stopWorkspaceSubscription()
    void router.replace('/workspaces')
    return
  }
  if (event.entity !== 'workspace' && event.entity !== 'member') return

  // 실시간 이벤트는 변경 사실만 전달하므로, 권한과 멤버 목록은 API에서 다시 읽어 정합성을 맞춘다.
  const id = event.workspace_id
  void (async () => {
    await loadWorkspace(id, false)
    if (event.entity === 'member' && activeSubscriptionWorkspaceId === id && realtime.isConnected) {
      await subscribeWorkspace(id)
    }
  })().catch((caught: unknown) => {
    console.warn(
      '[workspace] realtime reconciliation failed',
      caught instanceof Error ? caught.message : caught,
    )
  })
})

const removeWorkspacePresenceListener = realtime.on(
  'workspace.member_presence_changed',
  (value) => {
    const event = parseWorkspaceMemberPresenceEvent(value)
    if (!event || event.workspace_id !== workspaceId.value) return

    presenceSequence += 1
    livePresence.set(event.user_id, {
      online: event.online,
      sequence: presenceSequence,
    })
    const next = new Set(onlineUserIds.value)
    if (event.online) next.add(event.user_id)
    else next.delete(event.user_id)
    onlineUserIds.value = next
  },
)

watch(
  workspaceId,
  (id) => {
    inboxOpen.value = false
    stopWorkspaceSubscription()
    workspaceLoadGeneration += 1
    void loadWorkspace(id, true)
  },
  { immediate: true },
)

watch([workspaceId, currentRole], ([id, role]) => {
  if (id && role) startWorkspaceSubscription(id)
  else stopWorkspaceSubscription()
})

// 전역 메신저가 현재 워크스페이스 대화방과 카드 드롭 대상을 알 수 있도록 레이아웃 상태를 연결한다.
watch(
  [workspace, currentRole, workspaceSyncVersion],
  ([loadedWorkspace, role, syncVersion]) => {
    if (loadedWorkspace && role) {
      setMessengerWorkspace({
        id: loadedWorkspace.id,
        name: loadedWorkspace.name,
        syncVersion,
      })
      messengerContextWorkspaceId = loadedWorkspace.id
      return
    }

    if (messengerContextWorkspaceId) {
      clearMessengerWorkspace(messengerContextWorkspaceId)
      messengerContextWorkspaceId = null
    }
  },
  { immediate: true },
)

// 드래그 상태는 DOM 선택 방지와 종료 fallback에 함께 쓰이므로 동기적으로 페이지 클래스에 반영한다.
watch(
  () => messengerState.cardDrag !== null,
  (active) => {
    if (!active && cardDragEndFallback) {
      clearTimeout(cardDragEndFallback)
      cardDragEndFallback = null
    }
    setCardDragPageState(active)
  },
  { immediate: true, flush: 'sync' },
)

onMounted(() => {
  syncCompactViewport()
  window.addEventListener('resize', syncCompactViewport)
  window.addEventListener('dragend', scheduleCardDragEndFallback)
  window.addEventListener('pointerup', scheduleCardDragEndFallback)
  window.addEventListener('blur', scheduleCardDragEndFallback)
})

onUnmounted(() => {
  workspaceLoadGeneration += 1
  window.removeEventListener('resize', syncCompactViewport)
  window.removeEventListener('dragend', scheduleCardDragEndFallback)
  window.removeEventListener('pointerup', scheduleCardDragEndFallback)
  window.removeEventListener('blur', scheduleCardDragEndFallback)
  if (cardDragEndFallback) clearTimeout(cardDragEndFallback)
  cardDragEndFallback = null
  if (messengerState.cardDrag) finishCardDrag()
  setCardDragPageState(false)
  if (messengerContextWorkspaceId) {
    clearMessengerWorkspace(messengerContextWorkspaceId)
    messengerContextWorkspaceId = null
  }
  stopWorkspaceSubscription()
  removeWorkspaceChangeListener()
  removeWorkspacePresenceListener()
})
</script>

<template>
  <div v-if="workspace" class="app-shell" @dragover.capture="clearExternalDropOverWorkspace">
    <AppHeader :workspace-name="workspace.name">
      <template #workspace-actions>
        <WorkspaceMembersMenu
          :members="workspace.members"
          :online-user-ids="onlineUserIds"
          :can-manage="canManageMembers"
          @manage="showShareModal = true"
        />
        <WorkspaceLabelsMenu
          :workspace-id="workspaceId"
          :can-manage="canEditBoard"
          @changed="workspaceSyncVersion += 1"
        />
      </template>
    </AppHeader>

    <div
      class="content-area"
      :class="{
        'content-area--inbox-open': inboxOpen,
        'content-area--messenger-open': messengerState.open && !compactViewport,
        'content-area--messenger-directory-collapsed': messengerState.directoryCollapsed,
      }"
    >
      <aside
        v-if="inboxOpen"
        id="workspace-inbox-panel"
        class="workspace-inbox-sidebar w-82.5 min-w-70 shrink-0 grow-0 basis-82.5 flex min-h-0 overflow-hidden border-r border-gray-200 bg-white"
        aria-label="인박스"
      >
        <InboxCardsPanel
          :allow-drag="!compactViewport"
          :destination-lists="messengerState.inboxDestinations"
          :refresh-token="messengerState.inboxRefreshToken"
          :accepting-drop="!compactViewport && inboxAcceptingBoardCard"
          @drop-settled="onInboxDropSettled"
          @drag-start="onInboxCardDragStart"
          @drag-end="onInboxCardDragEnd"
        />
      </aside>

      <div class="workspace-route-content flex-1 min-w-0 min-h-0 flex overflow-hidden">
        <RouterView v-slot="{ Component }">
          <component
            :is="Component"
            :can-edit-board="canEditBoard"
            :can-view-card-details="canViewCardDetails"
            :can-manage-comments="canManageMembers"
            :workspace-sync-version="workspaceSyncVersion"
          />
        </RouterView>
      </div>
    </div>

    <WorkspaceToolbox
      :workspace-id="workspaceId"
      :inbox-open="inboxOpen"
      @toggle-inbox="toggleInbox"
      @close-inbox="closeInbox"
    />

    <ShareModal
      v-if="showShareModal && canManageMembers"
      :workspace-name="workspace.name"
      :workspace-id="workspaceId"
      :workspace="workspace"
      :manager-role="currentRole"
      @workspace-updated="applyWorkspaceUpdate"
      @close="showShareModal = false"
    />
  </div>
  <div v-else class="app-shell">
    <AppHeader />
    <main
      class="workspace-load-state grid place-items-center text-slate-500"
      :role="loadError ? 'alert' : 'status'"
    >
      {{ loadError || '워크스페이스를 불러오는 중…' }}
    </main>
  </div>
</template>

<style scoped src="../styles/workspace-layout.css"></style>
