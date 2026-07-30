<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import InboxCardsPanel from '../components/InboxCardsPanel.vue'
import ShareModal from '../components/ShareModal.vue'
import WorkspaceMembersMenu from '../components/WorkspaceMembersMenu.vue'
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
import type {
  Card,
  Workspace,
  WorkspaceSubscriptionResult,
} from '../types'
import {
  hasWorkspaceRole,
  workspaceRoleFor,
} from '../utils/workspacePermissions'

const route = useRoute()
const router = useRouter()
const workspaceId = computed(() => String(route.params.workspaceId ?? ''))
const workspace = ref<Workspace | null>(null)
const loadError = ref('')
const onlineUserIds = ref<Set<string>>(new Set())
const workspaceSyncVersion = ref(0)
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
const inboxOpen = ref(false)
const compactViewport = ref(false)
const CARD_DRAG_PAGE_CLASS = 'is-card-dragging'
const CARD_DRAG_END_GRACE_MS = 250
let cardDragEndFallback: ReturnType<typeof setTimeout> | null = null
const inboxAcceptingBoardCard = computed(
  () =>
    inboxOpen.value &&
    canEditBoard.value &&
    messengerState.cardDrag?.source === 'board',
)

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
  if (
    drag?.source !== 'board' ||
    !drop ||
    drop.committed ||
    drop.cardId !== drag.cardId
  ) {
    return
  }
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('[data-card-drop-target]')
  ) {
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
const livePresence = new Map<
  string,
  { online: boolean; sequence: number }
>()

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
      if (
        generation !== workspaceLoadGeneration ||
        id !== workspaceId.value
      ) {
        return
      }
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, SUBSCRIPTION_RETRY_DELAY_MS)
        })
        continue
      }
      const message =
        caught instanceof Error
          ? caught.message
          : '워크스페이스를 불러오지 못했습니다.'
      if (reset || !workspace.value) {
        loadError.value = message
      } else {
        console.warn('[workspace] background refresh failed', message)
      }
    }
  }
}

function applyPresenceSnapshot(
  onlineIds: readonly string[],
  sequenceAtStart: number,
): void {
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
    if (
      activeSubscriptionWorkspaceId !== id ||
      workspaceId.value !== id ||
      !realtime.isConnected
    ) {
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
        try {
          const loaded = await WorkspaceAPI.get(id)
          if (
            activeSubscriptionWorkspaceId === id &&
            workspaceId.value === id
          ) {
            workspace.value = loaded
            loadError.value = ''
            workspaceSyncVersion.value += 1
          }
        } catch {
          if (
            activeSubscriptionWorkspaceId === id &&
            workspaceId.value === id
          ) {
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

  if (
    activeSubscriptionWorkspaceId !== id ||
    workspaceId.value !== id
  ) {
    if (realtime.isConnected) {
      void realtime
        .request('workspace.unsubscribe', { workspace_id: id })
        .catch(() => undefined)
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
  removeSubscriptionRecovery = realtime.registerSubscriptionRecovery(
    `workspace:${id}`,
    () => subscribeWorkspace(id),
  )
}

const removeWorkspaceChangeListener = realtime.on(
  'workspace.changed',
  (value) => {
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

    const id = event.workspace_id
    void (async () => {
      await loadWorkspace(id, false)
      if (
        event.entity === 'member' &&
        activeSubscriptionWorkspaceId === id &&
        realtime.isConnected
      ) {
        await subscribeWorkspace(id)
      }
    })().catch((caught: unknown) => {
      console.warn(
        '[workspace] realtime reconciliation failed',
        caught instanceof Error ? caught.message : caught,
      )
    })
  },
)

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

watch(
  [workspaceId, currentRole],
  ([id, role]) => {
    if (id && role) startWorkspaceSubscription(id)
    else stopWorkspaceSubscription()
  },
)

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
  <div
    v-if="workspace"
    class="app-shell"
    @dragover.capture="clearExternalDropOverWorkspace"
  >
    <AppHeader :workspace-name="workspace.name">
      <template #workspace-actions>
        <WorkspaceMembersMenu
          :members="workspace.members"
          :online-user-ids="onlineUserIds"
          :can-manage="canManageMembers"
          @manage="showShareModal = true"
        />
      </template>
    </AppHeader>

    <div
      class="content-area"
      :class="{
        'content-area--inbox-open': inboxOpen,
        'content-area--messenger-open':
          messengerState.open && !compactViewport,
        'content-area--messenger-directory-collapsed':
          messengerState.directoryCollapsed,
      }"
    >
      <aside
        v-if="inboxOpen"
        id="workspace-inbox-panel"
        class="workspace-inbox-sidebar"
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

      <div class="workspace-route-content">
        <RouterView v-slot="{ Component }">
          <component
            :is="Component"
            :can-edit-board="canEditBoard"
            :can-view-card-details="canViewCardDetails"
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
      @close="showShareModal = false"
    />
  </div>
  <div v-else class="app-shell">
    <AppHeader />
    <main class="workspace-load-state" :role="loadError ? 'alert' : 'status'">
      {{ loadError || '워크스페이스를 불러오는 중…' }}
    </main>
  </div>
</template>

<style scoped src="../styles/workspace-layout.css"></style>
