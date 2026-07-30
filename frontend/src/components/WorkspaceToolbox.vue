<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  closeMessenger,
  messengerState,
  openWorkspaceConversation,
  showMessengerDirectory,
} from '../services/messenger'

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
const hasWorkspaceContext = computed(() => Boolean(props.workspaceId))
const workspaceActive = computed(() => route.path === '/workspaces')
const chatOpen = computed(
  () =>
    messengerState.open &&
    (compactViewport.value ||
      messengerState.pane === 'chat' ||
      messengerState.pane === 'dm'),
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

function selectInbox(): void {
  if (!hasWorkspaceContext.value) return
  if (compactViewport.value) {
    closeMessenger()
    if (props.inboxOpen) return
  }
  emit('toggle-inbox')
}

function selectChat(): void {
  if (compactViewport.value && messengerState.open) return
  emit('close-inbox')
  if (
    hasWorkspaceContext.value &&
    messengerState.workspace?.id === props.workspaceId
  ) {
    openWorkspaceConversation(messengerState.workspace)
    return
  }
  showMessengerDirectory()
}

onMounted(() => {
  syncCompactViewport()
  window.addEventListener('resize', syncCompactViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncCompactViewport)
})
</script>

<template>
  <nav class="workspace-toolbox" aria-label="워크스페이스 빠른 도구">
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
    </div>

    <div
      class="workspace-toolbox__group workspace-toolbox__group--toggles"
      role="group"
      aria-label="보조 기능"
    >
      <button
        class="workspace-toolbox__item"
        :class="{
          'workspace-toolbox__item--active':
            hasWorkspaceContext && inboxOpen,
        }"
        type="button"
        :disabled="!hasWorkspaceContext"
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

      <button
        class="workspace-toolbox__item workspace-toolbox__item--mobile-chat"
        :class="{ 'workspace-toolbox__item--active': chatOpen }"
        type="button"
        title="메신저"
        :aria-pressed="chatOpen"
        aria-controls="messenger-window"
        @click="selectChat"
      >
        <svg
          class="workspace-toolbox__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4 5h16v12H9l-5 4V5Z" />
          <path d="M8 10h8M8 13h5" />
        </svg>
        <span>채팅</span>
      </button>
    </div>
  </nav>
</template>

<style scoped src="../styles/workspace-toolbox.css"></style>
