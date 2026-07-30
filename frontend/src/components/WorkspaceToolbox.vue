<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { InboxAPI } from '../api/inbox'
import {
  claimExternalCardDrop,
  clearExternalCardDropHover,
  closeMessenger,
  messengerState,
  notifyBoardChanged,
  notifyInboxChanged,
  openMessenger,
  openWorkspaceConversation,
  requestChatCardAttachment,
  setExternalCardDropHover,
  showMessengerDirectory,
} from '../services/messenger'
import {
  formatMessengerUnreadCount,
  totalMessengerUnreadCount,
} from '../services/messengerUnread'

const props = withDefaults(
  defineProps<{
    workspaceId?: string
    inboxOpen?: boolean
  }>(),
  {
    workspaceId: '',
    inboxOpen: false,
  },
)

const emit = defineEmits<{
  'toggle-inbox': []
  'close-inbox': []
}>()

const route = useRoute()
const compactViewport = ref(false)
const inboxButton = ref<HTMLButtonElement | null>(null)
const chatButton = ref<HTMLButtonElement | null>(null)
const toolboxDropPending = ref<'inbox' | null>(null)
const toolboxDropError = ref('')
let suppressedClick: 'inbox' | 'chat' | null = null
let suppressedClickTimer: ReturnType<typeof setTimeout> | null = null
const boardPath = computed(
  () => props.workspaceId
    ? `/workspaces/${props.workspaceId}/board`
    : '',
)
const calendarPath = computed(
  () => props.workspaceId
    ? `/workspaces/${props.workspaceId}/calendar`
    : '',
)
const dashboardPath = computed(
  () => props.workspaceId
    ? `/workspaces/${props.workspaceId}/dashboard`
    : '',
)
const hasWorkspaceContext = computed(() => Boolean(props.workspaceId))
const workspaceActive = computed(() => route.path === '/workspaces')
const chatOpen = computed(() => messengerState.open)
const totalUnreadLabel = computed(() =>
  formatMessengerUnreadCount(totalMessengerUnreadCount.value),
)
const draggedBoardCardId = computed(() =>
  messengerState.cardDrag?.source === 'board'
    ? messengerState.cardDrag.cardId
    : null,
)
const inboxDropReady = computed(
  () =>
    Boolean(draggedBoardCardId.value) &&
    hasWorkspaceContext.value &&
    !props.inboxOpen,
)
const chatDropReady = computed(
  () =>
    Boolean(draggedBoardCardId.value) &&
    hasWorkspaceContext.value &&
    !chatOpen.value,
)
const inboxDropOver = computed(
  () =>
    messengerState.externalCardDrop?.owner === 'toolbox-inbox' &&
    messengerState.externalCardDrop.cardId === draggedBoardCardId.value,
)
const chatDropOver = computed(
  () =>
    messengerState.externalCardDrop?.owner === 'toolbox-chat' &&
    messengerState.externalCardDrop.cardId === draggedBoardCardId.value,
)
const boardActive = computed(
  () =>
    route.path === boardPath.value &&
    (!compactViewport.value || (!props.inboxOpen && !chatOpen.value)),
)
const calendarActive = computed(
  () =>
    route.path === calendarPath.value &&
    (!compactViewport.value || (!props.inboxOpen && !chatOpen.value)),
)
const dashboardActive = computed(
  () =>
    route.path === dashboardPath.value &&
    (!compactViewport.value || (!props.inboxOpen && !chatOpen.value)),
)

function syncCompactViewport(): void {
  compactViewport.value = window.innerWidth <= 760
}

function selectWorkspace(): void {
  emit('close-inbox')
  if (compactViewport.value) closeMessenger()
}

function selectWorkspacePage(): void {
  if (!compactViewport.value) return
  emit('close-inbox')
  closeMessenger()
}

function consumeSuppressedClick(target: 'inbox' | 'chat'): boolean {
  if (suppressedClick !== target) return false
  suppressedClick = null
  if (suppressedClickTimer) {
    clearTimeout(suppressedClickTimer)
    suppressedClickTimer = null
  }
  return true
}

function suppressDropClick(target: 'inbox' | 'chat'): void {
  suppressedClick = target
  if (suppressedClickTimer) clearTimeout(suppressedClickTimer)
  suppressedClickTimer = setTimeout(() => {
    suppressedClick = null
    suppressedClickTimer = null
  }, 250)
}

function selectInbox(): void {
  if (consumeSuppressedClick('inbox')) return
  if (!hasWorkspaceContext.value) return
  if (compactViewport.value) {
    closeMessenger()
    if (props.inboxOpen) return
  }
  emit('toggle-inbox')
}

function selectChat(): void {
  if (consumeSuppressedClick('chat')) return
  if (messengerState.open) {
    closeMessenger()
    return
  }
  if (compactViewport.value) emit('close-inbox')
  if (messengerState.pane !== 'directory') {
    openMessenger()
    return
  }
  if (
    hasWorkspaceContext.value &&
    messengerState.workspace?.id === props.workspaceId
  ) {
    openWorkspaceConversation(messengerState.workspace)
    return
  }
  showMessengerDirectory()
}

function containsPoint(
  element: HTMLElement | null,
  clientX: number,
  clientY: number,
): boolean {
  if (!element) return false
  const bounds = element.getBoundingClientRect()
  return (
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  )
}

function clearToolboxDropHover(cardId: string): void {
  clearExternalCardDropHover(cardId, 'toolbox-inbox')
  clearExternalCardDropHover(cardId, 'toolbox-chat')
}

function updateToolboxDropHover(
  event: Pick<MouseEvent, 'clientX' | 'clientY'>,
): 'inbox' | 'chat' | null {
  const cardId = draggedBoardCardId.value
  if (!cardId) return null

  if (
    inboxDropReady.value &&
    containsPoint(inboxButton.value, event.clientX, event.clientY)
  ) {
    clearExternalCardDropHover(cardId, 'toolbox-chat')
    setExternalCardDropHover(
      cardId,
      'inbox',
      'toolbox-inbox',
    )
    return 'inbox'
  }

  if (
    chatDropReady.value &&
    containsPoint(chatButton.value, event.clientX, event.clientY)
  ) {
    clearExternalCardDropHover(cardId, 'toolbox-inbox')
    setExternalCardDropHover(cardId, 'chat', 'toolbox-chat')
    return 'chat'
  }

  clearToolboxDropHover(cardId)
  return null
}

function handleToolboxDragMove(event: MouseEvent | DragEvent): void {
  const target = updateToolboxDropHover(event)
  if (target && event.type === 'dragover') {
    event.preventDefault()
    if (event instanceof DragEvent && event.dataTransfer) {
      event.dataTransfer.dropEffect = target === 'chat' ? 'link' : 'move'
    }
  }
}

async function moveCardToInbox(cardId: string): Promise<void> {
  toolboxDropPending.value = 'inbox'
  toolboxDropError.value = ''
  try {
    await InboxAPI.moveToInbox(cardId)
    notifyBoardChanged()
    notifyInboxChanged()
  } catch (caught) {
    toolboxDropError.value =
      caught instanceof Error
        ? caught.message
        : '카드를 인박스로 옮기지 못했습니다.'
    notifyBoardChanged()
  } finally {
    toolboxDropPending.value = null
  }
}

function commitToolboxDrop(
  event: MouseEvent | DragEvent,
): void {
  const target = updateToolboxDropHover(event)
  const cardId = draggedBoardCardId.value
  const drop = messengerState.externalCardDrop
  if (
    !target ||
    !cardId ||
    !drop ||
    drop.cardId !== cardId ||
    drop.committed
  ) {
    return
  }

  if (event.type === 'drop') event.preventDefault()
  suppressDropClick(target)

  if (target === 'chat') {
    requestChatCardAttachment(cardId, 'toolbox-chat')
    return
  }

  if (!claimExternalCardDrop(cardId, 'inbox', 'toolbox-inbox')) return
  void moveCardToInbox(cardId)
}

onMounted(() => {
  syncCompactViewport()
  window.addEventListener('resize', syncCompactViewport)
  window.addEventListener('dragover', handleToolboxDragMove, true)
  window.addEventListener('mousemove', handleToolboxDragMove, true)
  window.addEventListener('pointermove', handleToolboxDragMove, true)
  window.addEventListener('drop', commitToolboxDrop, true)
  window.addEventListener('mouseup', commitToolboxDrop, true)
  window.addEventListener('pointerup', commitToolboxDrop, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncCompactViewport)
  window.removeEventListener('dragover', handleToolboxDragMove, true)
  window.removeEventListener('mousemove', handleToolboxDragMove, true)
  window.removeEventListener('pointermove', handleToolboxDragMove, true)
  window.removeEventListener('drop', commitToolboxDrop, true)
  window.removeEventListener('mouseup', commitToolboxDrop, true)
  window.removeEventListener('pointerup', commitToolboxDrop, true)
  if (suppressedClickTimer) clearTimeout(suppressedClickTimer)
})
</script>

<template>
  <nav class="workspace-toolbox" aria-label="워크스페이스 빠른 도구">
    <p
      v-if="toolboxDropError"
      class="workspace-toolbox__drop-error"
      role="alert"
    >
      {{ toolboxDropError }}
    </p>
    <div
      class="workspace-toolbox__group workspace-toolbox__group--workspace"
      role="group"
      aria-label="워크스페이스"
    >
      <RouterLink
        to="/workspaces"
        class="workspace-toolbox__item"
        :class="{ 'workspace-toolbox__item--active': workspaceActive }"
        title="워크스페이스 선택"
        @click="selectWorkspace"
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="8" height="7" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="3" y="13" width="8" height="7" rx="1.5" />
          <rect x="13" y="13" width="8" height="7" rx="1.5" />
        </svg>
        <span>워크스페이스</span>
      </RouterLink>

      <button
        ref="inboxButton"
        data-card-drop-target="toolbox-inbox"
        class="workspace-toolbox__item"
        :class="{
          'workspace-toolbox__item--active':
            hasWorkspaceContext && inboxOpen,
          'workspace-toolbox__item--card-drop-ready': inboxDropReady,
          'workspace-toolbox__item--card-drop-over': inboxDropOver,
        }"
        type="button"
        :disabled="!hasWorkspaceContext || toolboxDropPending === 'inbox'"
        :title="
          hasWorkspaceContext
            ? '개인 인박스'
            : '먼저 워크스페이스를 선택하세요.'
        "
        :aria-controls="
          hasWorkspaceContext ? 'workspace-inbox-panel' : undefined
        "
        :aria-expanded="hasWorkspaceContext ? inboxOpen : undefined"
        @click="selectInbox"
        @dragenter="handleToolboxDragMove"
        @dragover="handleToolboxDragMove"
        @drop.capture="commitToolboxDrop"
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4 4h16l1 10v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5L4 4Z" />
          <path d="M3 14h5l2 3h4l2-3h5" />
        </svg>
        <span>인박스</span>
      </button>
    </div>

    <div
      class="workspace-toolbox__group workspace-toolbox__group--functions"
      role="group"
      aria-label="워크스페이스 기능"
    >
      <RouterLink
        v-if="hasWorkspaceContext"
        :to="boardPath"
        class="workspace-toolbox__item"
        :class="{ 'workspace-toolbox__item--active': boardActive }"
        title="보드"
        @click="selectWorkspacePage"
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v10" />
        </svg>
        <span>보드</span>
      </RouterLink>
      <button
        v-else
        class="workspace-toolbox__item"
        type="button"
        title="먼저 워크스페이스를 선택하세요."
        disabled
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v10" />
        </svg>
        <span>보드</span>
      </button>

      <RouterLink
        v-if="hasWorkspaceContext"
        :to="calendarPath"
        class="workspace-toolbox__item"
        :class="{ 'workspace-toolbox__item--active': calendarActive }"
        title="캘린더"
        @click="selectWorkspacePage"
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
        </svg>
        <span>캘린더</span>
      </RouterLink>
      <button
        v-else
        class="workspace-toolbox__item"
        type="button"
        title="먼저 워크스페이스를 선택하세요."
        disabled
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
        </svg>
        <span>캘린더</span>
      </button>

      <RouterLink
        v-if="hasWorkspaceContext"
        :to="dashboardPath"
        class="workspace-toolbox__item"
        :class="{ 'workspace-toolbox__item--active': dashboardActive }"
        title="대시보드"
        @click="selectWorkspacePage"
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="7" width="4" height="13" rx="1" />
          <rect x="17" y="3" width="4" height="17" rx="1" />
        </svg>
        <span>대시보드</span>
      </RouterLink>
      <button
        v-else
        class="workspace-toolbox__item"
        type="button"
        title="먼저 워크스페이스를 선택하세요."
        disabled
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="7" width="4" height="13" rx="1" />
          <rect x="17" y="3" width="4" height="17" rx="1" />
        </svg>
        <span>대시보드</span>
      </button>
    </div>

    <div
      class="workspace-toolbox__group workspace-toolbox__group--messenger"
      role="group"
      aria-label="메신저"
    >
      <button
        ref="chatButton"
        data-card-drop-target="toolbox-chat"
        class="workspace-toolbox__item"
        :class="{
          'workspace-toolbox__item--active': chatOpen,
          'workspace-toolbox__item--card-drop-ready': chatDropReady,
          'workspace-toolbox__item--card-drop-over': chatDropOver,
        }"
        type="button"
        title="메신저"
        :aria-expanded="chatOpen"
        aria-controls="messenger-window"
        @click="selectChat"
        @dragenter="handleToolboxDragMove"
        @dragover="handleToolboxDragMove"
        @drop.capture="commitToolboxDrop"
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4 5h16v12H9l-5 4V5Z" />
          <path d="M8 10h8M8 13h5" />
        </svg>
        <span
          v-if="totalMessengerUnreadCount"
          class="workspace-toolbox__badge"
          :aria-label="
            `읽지 않은 메시지 및 활동 ${totalMessengerUnreadCount}개`
          "
        >
          {{ totalUnreadLabel }}
        </span>
        <span>채팅</span>
      </button>
    </div>
  </nav>
</template>

<style scoped src="../styles/workspace-toolbox.css"></style>
