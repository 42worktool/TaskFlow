<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FriendsPanel from './FriendsPanel.vue'
import InboxCardsPanel from './InboxCardsPanel.vue'
import InboxDropTarget from './InboxDropTarget.vue'
import WorkspaceChatPanel from './WorkspaceChatPanel.vue'
import { authState } from '../services/auth'
import {
  closeMessenger,
  finishCardDrag,
  messengerState,
  notifyBoardChanged,
  notifyInboxChanged,
  openMessenger,
  resetMessenger,
  startCardDrag,
  toggleMessenger,
  type MessengerPane,
} from '../services/messenger'

const route = useRoute()
const router = useRouter()
const closeButton = ref<HTMLButtonElement | null>(null)
const launcher = ref<HTMLButtonElement | null>(null)
const visited = ref<Record<MessengerPane, boolean>>({
  friends: false,
  inbox: false,
  chat: false,
})
let returnFocus: HTMLElement | null = null

const inboxCardDragging = computed(
  () => messengerState.cardDrag?.source === 'inbox',
)
const boardCardDragging = computed(
  () => messengerState.cardDrag?.source === 'board',
)
const openInboxAcceptingDrop = computed(
  () =>
    messengerState.open &&
    messengerState.pane === 'inbox' &&
    boardCardDragging.value,
)
const shellVisible = computed(
  () =>
    messengerState.open &&
    !inboxCardDragging.value &&
    !(boardCardDragging.value && messengerState.pane !== 'inbox'),
)
const edgeDropActive = computed(
  () => boardCardDragging.value && !openInboxAcceptingDrop.value,
)

function paneFromQuery(value: unknown): MessengerPane | null {
  return value === 'friends' || value === 'inbox' || value === 'chat'
    ? value
    : null
}

function clearMessengerQuery(): void {
  if (
    !paneFromQuery(route.query.messenger) &&
    !paneFromQuery(route.query.drawer)
  ) {
    return
  }
  const query = { ...route.query }
  delete query.messenger
  delete query.drawer
  void router.replace({ query })
}

function selectPane(pane: MessengerPane): void {
  if (pane === 'chat' && !messengerState.workspace) return
  openMessenger(pane)
}

function closeWindow(): void {
  if (messengerState.cardDrag) return
  closeMessenger()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && messengerState.open && !messengerState.cardDrag) {
    closeWindow()
  }
}

function handleInboxDragStart(card: { id: string }): void {
  startCardDrag(card.id, 'inbox')
}

function handleInboxDragEnd(movedToBoard: boolean): void {
  finishCardDrag()
  if (movedToBoard) closeMessenger()
}

function handleInboxDropSettled(): void {
  notifyBoardChanged()
  notifyInboxChanged()
}

function handleEdgeDropSettled(stored: boolean): void {
  notifyBoardChanged()
  notifyInboxChanged()
  if (stored) openMessenger('inbox')
}

watch(
  [() => messengerState.open, () => messengerState.pane],
  async ([open, pane], [previousOpen]) => {
    if (open) visited.value[pane] = true
    if (messengerState.cardDrag) return

    if (open && !previousOpen) {
      const focused = document.activeElement
      returnFocus =
        focused instanceof HTMLElement && focused !== document.body
          ? focused
          : null
      await nextTick()
      closeButton.value?.focus()
    } else if (!open && previousOpen) {
      await nextTick()
      ;(returnFocus ?? launcher.value)?.focus()
      returnFocus = null
    }
  },
)

watch(
  [
    () => route.query.messenger,
    () => route.query.drawer,
    () => messengerState.workspace?.id,
    () => authState.user?.id,
  ],
  ([messengerQuery, legacyDrawer]) => {
    if (!authState.user) return
    const requested =
      paneFromQuery(messengerQuery) ?? paneFromQuery(legacyDrawer)
    if (!requested || (requested === 'chat' && !messengerState.workspace)) return
    openMessenger(requested)
    clearMessengerQuery()
  },
  { immediate: true },
)

watch(
  () => authState.user?.id,
  (userId, previousUserId) => {
    if (previousUserId && userId !== previousUserId) {
      resetMessenger()
      visited.value = { friends: false, inbox: false, chat: false }
    }
  },
)

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
  finishCardDrag()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <template v-if="authState.user">
      <InboxDropTarget
        :enabled="messengerState.inboxDestinations.length > 0"
        :active="edgeDropActive"
        @settled="handleEdgeDropSettled"
      />

      <aside
        id="messenger-window"
        class="messenger-window"
        :class="{
          'messenger-window--open': shellVisible,
          'messenger-window--drag-hidden':
            messengerState.open && !shellVisible,
        }"
        :aria-hidden="shellVisible ? 'false' : 'true'"
        aria-label="메신저"
      >
        <header class="messenger-header">
          <div>
            <strong>TaskFlow 메신저</strong>
            <span v-if="messengerState.workspace">
              {{ messengerState.workspace.name }}
            </span>
          </div>
          <button
            ref="closeButton"
            class="messenger-close"
            type="button"
            aria-label="메신저 닫기"
            @click="closeWindow"
          >
            ×
          </button>
        </header>

        <nav class="messenger-tabs" aria-label="메신저 메뉴">
          <button
            type="button"
            :class="{ 'messenger-tab--active': messengerState.pane === 'friends' }"
            @click="selectPane('friends')"
          >
            친구
          </button>
          <button
            type="button"
            :class="{ 'messenger-tab--active': messengerState.pane === 'inbox' }"
            @click="selectPane('inbox')"
          >
            인박스
          </button>
          <button
            type="button"
            :disabled="!messengerState.workspace"
            :title="
              messengerState.workspace
                ? '현재 워크스페이스 채팅'
                : '워크스페이스 안에서 사용할 수 있습니다.'
            "
            :class="{ 'messenger-tab--active': messengerState.pane === 'chat' }"
            @click="selectPane('chat')"
          >
            채팅
          </button>
        </nav>

        <div class="messenger-body">
          <div
            v-if="visited.friends"
            v-show="messengerState.pane === 'friends'"
            class="messenger-pane"
          >
            <FriendsPanel />
          </div>
          <div
            v-if="visited.inbox"
            v-show="messengerState.pane === 'inbox'"
            class="messenger-pane"
          >
            <InboxCardsPanel
              compact
              :destination-lists="messengerState.inboxDestinations"
              :refresh-token="messengerState.inboxRefreshToken"
              :accepting-drop="openInboxAcceptingDrop"
              @drop-settled="handleInboxDropSettled"
              @drag-start="handleInboxDragStart"
              @drag-end="handleInboxDragEnd"
            />
          </div>
          <div
            v-if="visited.chat && messengerState.workspace"
            v-show="messengerState.pane === 'chat'"
            class="messenger-pane"
          >
            <WorkspaceChatPanel
              :key="messengerState.workspace.id"
              :workspace-id="messengerState.workspace.id"
              :workspace-name="messengerState.workspace.name"
              :workspace-sync-version="messengerState.workspace.syncVersion"
            />
          </div>
        </div>
      </aside>

      <button
        v-show="!edgeDropActive"
        ref="launcher"
        class="messenger-launcher"
        type="button"
        aria-label="메신저 열기"
        aria-controls="messenger-window"
        :aria-expanded="messengerState.open"
        @click="toggleMessenger()"
      >
        <span aria-hidden="true">●</span>
        <span aria-hidden="true">💬</span>
      </button>
    </template>
  </Teleport>
</template>

<style scoped src="../styles/messenger.css"></style>
