<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DirectMessagePanel from './DirectMessagePanel.vue'
import FriendsPanel from './FriendsPanel.vue'
import WorkspaceChatPanel from './WorkspaceChatPanel.vue'
import { FriendAPI } from '../api/friend'
import { WorkspaceAPI } from '../api/workspace'
import { authState } from '../services/auth'
import {
  clearExternalCardDropHover,
  closeMessenger,
  messengerState,
  openDirectConversation,
  openMessenger,
  openWorkspaceConversation,
  resetMessenger,
  showFriendManagement,
  showMessengerDirectory,
  toggleMessengerDirectory,
  type MessengerPane,
} from '../services/messenger'
import {
  directMessageUnreadCount,
  formatMessengerUnreadCount,
  markDirectConversationRead,
  markWorkspaceConversationRead,
  parseNotificationEvent,
  pruneMessengerUnreadRooms,
  receiveDirectMessageUnread,
  receiveWorkspaceActivityUnread,
  receiveWorkspaceMessageUnread,
  totalMessengerUnreadCount,
  workspaceUnreadCount,
  type VisibleMessengerRoom,
} from '../services/messengerUnread'
import { realtime } from '../services/realtime'
import {
  parseDirectMessage,
  parseFriendPresenceEvent,
  parseWorkspaceMessage,
} from '../services/realtime/protocol'
import type { Friend, Workspace } from '../types'

const route = useRoute()
const router = useRouter()
const closeButton = ref<HTMLButtonElement | null>(null)
const compactViewport = ref(false)
const directoryFriends = ref<Friend[]>([])
const directoryWorkspaces = ref<Workspace[]>([])
const directoryLoading = ref(false)
const directoryError = ref('')
let directoryLoadGeneration = 0
let returnFocus: HTMLElement | null = null

const toolboxRoute = computed(
  () =>
    (route.path === '/workspaces' ||
      route.path.startsWith('/workspaces/')),
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
const totalUnreadLabel = computed(() =>
  formatMessengerUnreadCount(totalMessengerUnreadCount.value),
)
const directoryVisible = computed(
  () =>
    compactViewport.value
      ? messengerState.pane === 'directory'
      : !messengerState.directoryCollapsed,
)
const conversationVisible = computed(
  () => !compactViewport.value || messengerState.pane !== 'directory',
)

function paneFromQuery(value: unknown): MessengerPane | null {
  return value === 'friends' || value === 'chat'
    ? value
    : null
}

function clearMessengerQuery(): void {
  if (route.query.messenger === undefined && route.query.drawer === undefined) {
    return
  }
  const query = { ...route.query }
  delete query.messenger
  delete query.drawer
  void router.replace({ query })
}

function closeWindow(): void {
  closeMessenger()
}

function clearChatDropOutsidePanel(event: DragEvent): void {
  const drag = messengerState.cardDrag
  const drop = messengerState.externalCardDrop
  if (
    drag?.source !== 'board' ||
    !drop ||
    drop.committed ||
    drop.cardId !== drag.cardId ||
    drop.owner !== 'chat-panel'
  ) {
    return
  }
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('.workspace-chat-panel')
  ) {
    return
  }
  clearExternalCardDropHover(drag.cardId, 'chat-panel')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && messengerState.open) closeWindow()
}

function handleResize(): void {
  compactViewport.value = window.matchMedia('(max-width: 760px)').matches
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
    pruneMessengerUnreadRooms(
      workspaces.my.map((workspace) => workspace.id),
      friends.map((friend) => friend.id),
    )

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

function visibleMessengerRoom(): VisibleMessengerRoom | null {
  if (
    !messengerState.open ||
    document.visibilityState !== 'visible'
  ) {
    return null
  }
  if (
    messengerState.pane === 'chat' &&
    messengerState.activeRoom?.kind === 'workspace'
  ) {
    return {
      kind: 'workspace',
      id: messengerState.activeRoom.workspace.id,
    }
  }
  if (
    messengerState.pane === 'dm' &&
    messengerState.activeRoom?.kind === 'dm'
  ) {
    return {
      kind: 'dm',
      id: messengerState.activeRoom.friend.id,
    }
  }
  return null
}

function markVisibleConversationRead(): void {
  const room = visibleMessengerRoom()
  if (room?.kind === 'workspace') {
    markWorkspaceConversationRead(room.id)
  } else if (room?.kind === 'dm') {
    markDirectConversationRead(room.id)
  }
}

function receiveWorkspaceMessage(value: unknown): void {
  const message = parseWorkspaceMessage(value)
  if (!message) return
  receiveWorkspaceMessageUnread(
    message,
    authState.user?.id ?? null,
    visibleMessengerRoom(),
  )
}

function receiveDirectMessage(value: unknown): void {
  const message = parseDirectMessage(value)
  if (!message) return
  receiveDirectMessageUnread(
    message,
    authState.user?.id ?? null,
    visibleMessengerRoom(),
  )
}

function receiveWorkspaceActivity(value: unknown): void {
  const event = parseNotificationEvent(value)
  if (!event) return
  receiveWorkspaceActivityUnread(
    event,
    authState.user?.id ?? null,
    visibleMessengerRoom(),
  )
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
let removeWorkspaceMessageListener: (() => void) | null = null
let removeDirectMessageListener: (() => void) | null = null
let removeWorkspaceActivityListener: (() => void) | null = null

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
      closeButton.value?.focus()
    } else if (!open && previousOpen) {
      await nextTick()
      returnFocus?.focus()
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
    if (!requested) {
      clearMessengerQuery()
      return
    }
    if (requested === 'chat' && !messengerState.workspace) return
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
      if (messengerState.open) void loadDirectory()
    }
  },
)

onMounted(() => {
  compactViewport.value = window.matchMedia('(max-width: 760px)').matches
  removeFriendPresenceListener = realtime.on(
    'friend.presence_changed',
    receiveFriendPresence,
  )
  removeWorkspaceMessageListener = realtime.on(
    'workspace.message_created',
    receiveWorkspaceMessage,
  )
  removeDirectMessageListener = realtime.on(
    'dm.message_created',
    receiveDirectMessage,
  )
  removeWorkspaceActivityListener = realtime.on(
    'notification.created',
    receiveWorkspaceActivity,
  )
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
  document.addEventListener('visibilitychange', markVisibleConversationRead)
  if (messengerState.open) void loadDirectory()
})
onUnmounted(() => {
  directoryLoadGeneration += 1
  removeFriendPresenceListener?.()
  removeWorkspaceMessageListener?.()
  removeDirectMessageListener?.()
  removeWorkspaceActivityListener?.()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('visibilitychange', markVisibleConversationRead)
})
</script>

<template>
  <Teleport to="body">
    <template v-if="authState.user">
      <span
        class="messenger-unread-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{
          totalMessengerUnreadCount
            ? `읽지 않은 메시지 및 활동 ${totalMessengerUnreadCount}개`
            : ''
        }}
      </span>
      <aside
        id="messenger-window"
        class="messenger-window"
        :class="{
          'messenger-window--open': messengerState.open,
          'messenger-window--directory-collapsed':
            messengerState.directoryCollapsed,
          'messenger-window--mobile-page': compactViewport,
          'messenger-window--with-toolbox': toolboxRoute,
        }"
        :aria-hidden="messengerState.open ? 'false' : 'true'"
        aria-label="메신저"
        @dragover.capture="clearChatDropOutsidePanel"
      >
        <header class="messenger-header">
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
            <div class="messenger-header__title-row">
              <strong>TaskFlow 메신저</strong>
              <span
                v-if="totalMessengerUnreadCount"
                class="messenger-header__unread-badge"
                :aria-label="
                  `읽지 않은 메시지 및 활동 ${totalMessengerUnreadCount}개`
                "
              >
                {{ totalUnreadLabel }}
              </span>
            </div>
            <span>{{ activeRoomTitle }}</span>
          </div>
          <button
            v-if="!compactViewport"
            class="messenger-directory-toggle"
            type="button"
            :aria-label="
              messengerState.directoryCollapsed
                ? '대화 목록 펼치기'
                : '대화 목록 접기'
            "
            aria-controls="messenger-directory"
            :aria-expanded="!messengerState.directoryCollapsed"
            @click="toggleMessengerDirectory"
          >
            {{ messengerState.directoryCollapsed ? '‹' : '›' }}
          </button>
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
            id="messenger-directory"
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
                  <span class="messenger-directory-item__title">
                    <strong>{{ workspace.name }}</strong>
                    <span
                      v-if="workspaceUnreadCount(workspace.id)"
                      class="messenger-room-unread-badge"
                      :aria-label="
                        `읽지 않은 메시지 및 활동 ${
                          workspaceUnreadCount(workspace.id)
                        }개`
                      "
                    >
                      {{
                        formatMessengerUnreadCount(
                          workspaceUnreadCount(workspace.id),
                        )
                      }}
                    </span>
                  </span>
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
                  <span class="messenger-directory-item__title">
                    <strong>{{ friend.name }}</strong>
                    <span
                      v-if="directMessageUnreadCount(friend.id)"
                      class="messenger-room-unread-badge"
                      :aria-label="
                        `읽지 않은 메시지 ${
                          directMessageUnreadCount(friend.id)
                        }개`
                      "
                    >
                      {{
                        formatMessengerUnreadCount(
                          directMessageUnreadCount(friend.id),
                        )
                      }}
                    </span>
                  </span>
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
    </template>
  </Teleport>
</template>

<style scoped src="../styles/messenger.css"></style>
