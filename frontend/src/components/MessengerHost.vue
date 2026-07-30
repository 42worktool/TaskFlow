<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type CSSProperties,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DirectMessagePanel from './DirectMessagePanel.vue'
import FriendsPanel from './FriendsPanel.vue'
import WorkspaceChatPanel from './WorkspaceChatPanel.vue'
import { FriendAPI } from '../api/friend'
import { WorkspaceAPI } from '../api/workspace'
import { authState } from '../services/auth'
import {
  clampFloatingPosition,
  closeMessenger,
  exceedsDragThreshold,
  messengerState,
  openDirectConversation,
  openMessenger,
  openWorkspaceConversation,
  resetMessenger,
  showFriendManagement,
  showMessengerDirectory,
  toggleMessenger,
  type FloatingPosition,
  type MessengerPane,
} from '../services/messenger'
import { realtime } from '../services/realtime'
import { parseFriendPresenceEvent } from '../services/realtime/protocol'
import type { Friend, Workspace } from '../types'

type FloatingTarget = 'launcher' | 'window'

interface ActivePointerDrag {
  target: FloatingTarget
  pointerId: number
  start: FloatingPosition
  origin: FloatingPosition
  moved: boolean
}

const route = useRoute()
const router = useRouter()
const closeButton = ref<HTMLButtonElement | null>(null)
const launcher = ref<HTMLButtonElement | null>(null)
const messengerWindow = ref<HTMLElement | null>(null)
const floatingAnchor = ref<FloatingPosition | null>(null)
const activeDrag = ref<ActivePointerDrag | null>(null)
const compactViewport = ref(false)
const directoryFriends = ref<Friend[]>([])
const directoryWorkspaces = ref<Workspace[]>([])
const directoryLoading = ref(false)
const directoryError = ref('')
let directoryLoadGeneration = 0
let suppressLauncherClick = false
let returnFocus: HTMLElement | null = null

const mobileToolboxRoute = computed(
  () =>
    compactViewport.value &&
    (route.path === '/workspaces' ||
      route.path.startsWith('/workspaces/')),
)
const mobilePageMode = computed(
  () => compactViewport.value && messengerState.open,
)
const launcherStyle = computed(() =>
  mobileToolboxRoute.value
    ? {}
    : positionStyle(positionFromAnchor('launcher')),
)
const windowStyle = computed(() =>
  mobilePageMode.value ? {} : positionStyle(positionFromAnchor('window')),
)
const activeWorkspaceRoom = computed(() =>
  messengerState.activeRoom?.kind === 'workspace'
    ? messengerState.activeRoom.workspace
    : null,
)
const activeDirectFriend = computed(() =>
  messengerState.activeRoom?.kind === 'dm'
    ? messengerState.activeRoom.friend
    : null,
)
const activeRoomTitle = computed(() => {
  if (messengerState.pane === 'friends') return '친구 관리'
  if (messengerState.pane === 'chat' && activeWorkspaceRoom.value) {
    return activeWorkspaceRoom.value.name
  }
  if (messengerState.pane === 'dm' && activeDirectFriend.value) {
    return activeDirectFriend.value.name
  }
  return '대화 목록'
})
const directoryVisible = computed(
  () => !compactViewport.value || messengerState.pane === 'directory',
)
const conversationVisible = computed(
  () => !compactViewport.value || messengerState.pane !== 'directory',
)

function paneFromQuery(value: unknown): MessengerPane | null {
  return value === 'friends' || value === 'chat' ? value : null
}

function positionStyle(position: FloatingPosition | null): CSSProperties {
  if (!position) return {}
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
    right: 'auto',
    bottom: 'auto',
  }
}

function elementFor(target: FloatingTarget): HTMLElement | null {
  return target === 'launcher' ? launcher.value : messengerWindow.value
}

function sizeFor(target: FloatingTarget): {
  width: number
  height: number
} {
  const bounds = elementFor(target)?.getBoundingClientRect()
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    return { width: bounds.width, height: bounds.height }
  }
  return target === 'launcher'
    ? { width: 54, height: 54 }
    : { width: Math.min(760, window.innerWidth - 24), height: 640 }
}

function positionFromAnchor(
  target: FloatingTarget,
): FloatingPosition | null {
  if (!floatingAnchor.value) return null
  const size = sizeFor(target)
  return clampFloatingPosition(
    {
      x: floatingAnchor.value.x - size.width,
      y: floatingAnchor.value.y - size.height,
    },
    size,
    { width: window.innerWidth, height: window.innerHeight },
  )
}

function setAnchorFromPosition(
  target: FloatingTarget,
  position: FloatingPosition,
): void {
  const size = sizeFor(target)
  const clamped = clampFloatingPosition(
    position,
    size,
    { width: window.innerWidth, height: window.innerHeight },
  )
  floatingAnchor.value = {
    x: clamped.x + size.width,
    y: clamped.y + size.height,
  }
}

function syncAnchor(target: FloatingTarget): void {
  if (!floatingAnchor.value) {
    floatingAnchor.value = {
      x: window.innerWidth - 20,
      y: window.innerHeight - 20,
    }
  }
  if (target === 'window') {
    floatingAnchor.value = { ...floatingAnchor.value }
    return
  }
  const position = positionFromAnchor(target)
  if (position) setAnchorFromPosition(target, position)
}

async function syncFloatingPositions(): Promise<void> {
  await nextTick()
  if (mobilePageMode.value) return
  syncAnchor(messengerState.open ? 'window' : 'launcher')
}

async function resetDesktopFloatingPositions(): Promise<void> {
  await nextTick()
  floatingAnchor.value = {
    x: window.innerWidth - 20,
    y: window.innerHeight - 20,
  }
  syncAnchor(messengerState.open ? 'window' : 'launcher')
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

function cancelPointerDrag(): void {
  if (activeDrag.value?.target === 'launcher') {
    suppressLauncherClick = true
  }
  activeDrag.value = null
}

function closeWindow(): void {
  cancelPointerDrag()
  closeMessenger()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && messengerState.open) closeWindow()
}

function startPointerDrag(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  if (mobilePageMode.value) return
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
    return
  }
  if (
    target === 'window' &&
    event.target instanceof Element &&
    event.target.closest('button')
  ) {
    return
  }

  syncAnchor(target)
  const bounds = elementFor(target)?.getBoundingClientRect()
  if (!bounds) return

  if (target === 'launcher') suppressLauncherClick = false
  activeDrag.value = {
    target,
    pointerId: event.pointerId,
    start: { x: event.clientX, y: event.clientY },
    origin: { x: bounds.left, y: bounds.top },
    moved: false,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function movePointerDrag(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  const drag = activeDrag.value
  if (
    !drag ||
    drag.target !== target ||
    drag.pointerId !== event.pointerId
  ) {
    return
  }

  const current = { x: event.clientX, y: event.clientY }
  if (!drag.moved && !exceedsDragThreshold(drag.start, current)) return
  drag.moved = true
  setAnchorFromPosition(
    target,
    {
      x: drag.origin.x + current.x - drag.start.x,
      y: drag.origin.y + current.y - drag.start.y,
    },
  )
  event.preventDefault()
}

function finishPointerDrag(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  const drag = activeDrag.value
  if (
    !drag ||
    drag.target !== target ||
    drag.pointerId !== event.pointerId
  ) {
    return
  }

  if (target === 'launcher' && drag.moved) suppressLauncherClick = true
  activeDrag.value = null
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId)
  }
}

function cancelPointerDragFor(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  const drag = activeDrag.value
  if (
    !drag ||
    drag.target !== target ||
    drag.pointerId !== event.pointerId
  ) {
    return
  }
  activeDrag.value = null
  if (target === 'launcher') suppressLauncherClick = false
}

function handleLauncherClick(event: MouseEvent): void {
  if (suppressLauncherClick) {
    suppressLauncherClick = false
    event.preventDefault()
    return
  }
  toggleMessenger()
}

function handleResize(): void {
  compactViewport.value = window.matchMedia('(max-width: 760px)').matches
  if (mobilePageMode.value) {
    cancelPointerDrag()
    return
  }
  syncAnchor(messengerState.open ? 'window' : 'launcher')
}

async function loadDirectory(): Promise<void> {
  const generation = ++directoryLoadGeneration
  directoryLoading.value = true
  directoryError.value = ''
  try {
    const [friends, workspaces] = await Promise.all([
      FriendAPI.list(),
      WorkspaceAPI.list(),
    ])
    if (generation !== directoryLoadGeneration) return
    directoryFriends.value = friends
    directoryWorkspaces.value = workspaces.my

    const activeRoom = messengerState.activeRoom
    if (activeRoom?.kind === 'dm') {
      const currentFriend = friends.find(
        (friend) => friend.id === activeRoom.friend.id,
      )
      if (!currentFriend) {
        messengerState.activeRoom = null
        showMessengerDirectory()
      } else {
        activeRoom.friend = { ...currentFriend }
      }
    }
  } catch (caught) {
    if (generation !== directoryLoadGeneration) return
    directoryError.value =
      caught instanceof Error
        ? caught.message
        : '대화 목록을 불러오지 못했습니다.'
  } finally {
    if (generation === directoryLoadGeneration) {
      directoryLoading.value = false
    }
  }
}

function receiveFriendPresence(value: unknown): void {
  const event = parseFriendPresenceEvent(value)
  if (!event) return
  const friend = directoryFriends.value.find(
    (item) => item.id === event.user_id,
  )
  if (friend) friend.online = event.online
  if (
    messengerState.activeRoom?.kind === 'dm' &&
    messengerState.activeRoom.friend.id === event.user_id
  ) {
    messengerState.activeRoom.friend.online = event.online
  }
}

async function selectWorkspaceRoom(workspace: Workspace): Promise<void> {
  const routeWorkspace = messengerState.workspace
  openWorkspaceConversation({
    id: workspace.id,
    name: workspace.name,
    syncVersion:
      routeWorkspace?.id === workspace.id
        ? routeWorkspace.syncVersion
        : 0,
  })
  const targetPath = `/workspaces/${workspace.id}/board`
  if (route.path === targetPath) return
  try {
    await router.push(targetPath)
  } catch (caught) {
    directoryError.value =
      caught instanceof Error
        ? caught.message
        : '워크스페이스를 열지 못했습니다.'
    showMessengerDirectory()
  }
}

function selectDirectRoom(friend: Friend): void {
  openDirectConversation(friend)
}

function openFriendSettings(): void {
  showFriendManagement()
}

function returnToDirectory(): void {
  showMessengerDirectory()
  void loadDirectory()
}

let removeFriendPresenceListener: (() => void) | null = null

watch(
  [() => messengerState.open, () => messengerState.pane],
  async ([open], [previousOpen]) => {
    if (open && !previousOpen) {
      const focused = document.activeElement
      returnFocus =
        focused instanceof HTMLElement && focused !== document.body
          ? focused
          : null
      void loadDirectory()
      await nextTick()
      if (!mobilePageMode.value) syncAnchor('window')
      closeButton.value?.focus()
    } else if (!open && previousOpen) {
      await nextTick()
      if (!compactViewport.value) syncAnchor('launcher')
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
  async (userId, previousUserId) => {
    if (previousUserId && userId !== previousUserId) {
      resetMessenger()
      directoryFriends.value = []
      directoryWorkspaces.value = []
      directoryLoadGeneration += 1
    }
    if (userId) {
      await syncFloatingPositions()
      if (messengerState.open) void loadDirectory()
    }
  },
)

watch(mobilePageMode, async (enabled, previousEnabled) => {
  if (enabled) {
    cancelPointerDrag()
    return
  }
  if (previousEnabled && !compactViewport.value) {
    await resetDesktopFloatingPositions()
  }
})

onMounted(() => {
  compactViewport.value = window.matchMedia('(max-width: 760px)').matches
  removeFriendPresenceListener = realtime.on(
    'friend.presence_changed',
    receiveFriendPresence,
  )
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
  void syncFloatingPositions()
  if (messengerState.open) void loadDirectory()
})
onUnmounted(() => {
  directoryLoadGeneration += 1
  removeFriendPresenceListener?.()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <Teleport to="body">
    <template v-if="authState.user">
      <aside
        id="messenger-window"
        ref="messengerWindow"
        class="messenger-window"
        :class="{
          'messenger-window--open': messengerState.open,
          'messenger-window--moving': activeDrag?.target === 'window',
          'messenger-window--mobile-page': compactViewport,
          'messenger-window--with-toolbox': mobileToolboxRoute,
        }"
        :style="windowStyle"
        :aria-hidden="messengerState.open ? 'false' : 'true'"
        aria-label="메신저"
      >
        <header
          class="messenger-header"
          :title="
            mobilePageMode ? undefined : '드래그하여 메신저 이동'
          "
          @pointerdown="startPointerDrag($event, 'window')"
          @pointermove="movePointerDrag($event, 'window')"
          @pointerup="finishPointerDrag($event, 'window')"
          @pointercancel="cancelPointerDragFor($event, 'window')"
        >
          <button
            v-if="compactViewport && messengerState.pane !== 'directory'"
            class="messenger-back"
            type="button"
            aria-label="대화 목록으로 돌아가기"
            @click="returnToDirectory"
          >
            ‹
          </button>
          <div>
            <strong>TaskFlow 메신저</strong>
            <span>{{ activeRoomTitle }}</span>
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

        <div class="messenger-shell">
          <nav
            v-show="directoryVisible"
            class="messenger-directory"
            aria-label="메신저 대화 목록"
          >
            <div class="messenger-directory-heading">
              <strong>대화</strong>
              <button
                type="button"
                :disabled="directoryLoading"
                aria-label="대화 목록 새로고침"
                @click="loadDirectory"
              >
                ↻
              </button>
            </div>

            <button
              type="button"
              class="messenger-directory-action"
              :class="{
                'messenger-directory-item--active':
                  messengerState.pane === 'friends',
              }"
              @click="openFriendSettings"
            >
              <span aria-hidden="true">＋</span>
              <span>
                <strong>친구 관리</strong>
                <small>요청 보내기·수락·삭제</small>
              </span>
            </button>

            <p
              v-if="directoryError"
              class="messenger-directory-error"
              role="alert"
            >
              {{ directoryError }}
            </p>
            <p v-if="directoryLoading" class="messenger-directory-state">
              대화 목록을 불러오는 중…
            </p>

            <section class="messenger-directory-section">
              <h2>워크스페이스</h2>
              <p
                v-if="!directoryLoading && directoryWorkspaces.length === 0"
                class="messenger-directory-state"
              >
                참여 중인 워크스페이스가 없습니다.
              </p>
              <button
                v-for="workspace in directoryWorkspaces"
                :key="workspace.id"
                type="button"
                class="messenger-directory-item"
                :class="{
                  'messenger-directory-item--active':
                    messengerState.pane === 'chat' &&
                    activeWorkspaceRoom?.id === workspace.id,
                }"
                @click="selectWorkspaceRoom(workspace)"
              >
                <span class="messenger-room-avatar">#</span>
                <span>
                  <strong>{{ workspace.name }}</strong>
                  <small>워크스페이스 대화방</small>
                </span>
              </button>
            </section>

            <section class="messenger-directory-section">
              <h2>친구</h2>
              <p
                v-if="!directoryLoading && directoryFriends.length === 0"
                class="messenger-directory-state"
              >
                DM을 보낼 친구가 없습니다.
              </p>
              <button
                v-for="friend in directoryFriends"
                :key="friend.id"
                type="button"
                class="messenger-directory-item"
                :class="{
                  'messenger-directory-item--active':
                    messengerState.pane === 'dm' &&
                    activeDirectFriend?.id === friend.id,
                }"
                @click="selectDirectRoom(friend)"
              >
                <img
                  v-if="friend.profile_image_url"
                  :src="friend.profile_image_url"
                  alt=""
                  class="messenger-room-avatar"
                  referrerpolicy="no-referrer"
                />
                <span v-else class="messenger-room-avatar">
                  {{ friend.name.charAt(0).toUpperCase() }}
                </span>
                <span>
                  <strong>{{ friend.name }}</strong>
                  <small
                    class="messenger-friend-presence"
                    :class="{
                      'messenger-friend-presence--online': friend.online,
                    }"
                  >
                    {{ friend.online ? '온라인' : '오프라인' }}
                  </small>
                </span>
              </button>
            </section>
          </nav>

          <main
            v-show="conversationVisible"
            class="messenger-content"
            aria-live="polite"
          >
            <div
              v-if="messengerState.pane === 'directory'"
              class="messenger-welcome"
            >
              <span aria-hidden="true">💬</span>
              <h2>대화를 선택하세요</h2>
              <p>워크스페이스 대화방이나 친구를 선택하면 바로 이어집니다.</p>
            </div>
            <FriendsPanel
              v-else-if="messengerState.pane === 'friends'"
              @changed="loadDirectory"
              @open-dm="selectDirectRoom"
            />
            <WorkspaceChatPanel
              v-else-if="
                messengerState.pane === 'chat' && activeWorkspaceRoom
              "
              :key="activeWorkspaceRoom.id"
              :workspace-id="activeWorkspaceRoom.id"
              :workspace-name="activeWorkspaceRoom.name"
              :workspace-sync-version="activeWorkspaceRoom.syncVersion"
            />
            <DirectMessagePanel
              v-else-if="messengerState.pane === 'dm' && activeDirectFriend"
              :key="activeDirectFriend.id"
              :friend-id="activeDirectFriend.id"
              :friend-name="activeDirectFriend.name"
              :friend-profile-image-url="
                activeDirectFriend.profile_image_url
              "
              :friend-online="activeDirectFriend.online"
            />
            <div v-else class="messenger-welcome">
              <p>이 대화를 열 수 없습니다. 목록에서 다시 선택해 주세요.</p>
              <button type="button" @click="returnToDirectory">
                대화 목록 보기
              </button>
            </div>
          </main>
        </div>
      </aside>

      <button
        v-show="!messengerState.open"
        ref="launcher"
        class="messenger-launcher"
        :class="{
          'messenger-launcher--moving': activeDrag?.target === 'launcher',
          'messenger-launcher--mobile-toolbox': mobileToolboxRoute,
        }"
        :style="launcherStyle"
        type="button"
        aria-label="메신저 열기"
        aria-controls="messenger-window"
        :aria-expanded="messengerState.open"
        @pointerdown="startPointerDrag($event, 'launcher')"
        @pointermove="movePointerDrag($event, 'launcher')"
        @pointerup="finishPointerDrag($event, 'launcher')"
        @pointercancel="cancelPointerDragFor($event, 'launcher')"
        @click="handleLauncherClick"
      >
        <span aria-hidden="true">●</span>
        <span aria-hidden="true">💬</span>
      </button>
    </template>
  </Teleport>
</template>

<style scoped src="../styles/messenger.css"></style>
