<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  messengerState,
  toggleMessenger,
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
    hasWorkspaceContext.value &&
    messengerState.open &&
    messengerState.pane === 'chat',
)
const boardActive = computed(
  () => !props.inboxOpen && route.path === boardPath.value,
)
const calendarActive = computed(
  () => !props.inboxOpen && route.path === calendarPath.value,
)

function toggleInbox(): void {
  if (!hasWorkspaceContext.value) return
  emit('toggle-inbox')
}

function closeInbox(): void {
  emit('close-inbox')
}

function toggleChat(): void {
  if (!hasWorkspaceContext.value) return
  toggleMessenger('chat')
}
</script>

<template>
  <nav class="workspace-toolbox" aria-label="워크스페이스 빠른 도구">
    <RouterLink
      to="/workspaces"
      class="workspace-toolbox__item"
      :class="{ 'workspace-toolbox__item--active': workspaceActive }"
      title="워크스페이스 선택"
      @click="closeInbox"
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

    <RouterLink
      v-if="hasWorkspaceContext"
      :to="boardPath"
      class="workspace-toolbox__item"
      :class="{ 'workspace-toolbox__item--active': boardActive }"
      title="보드"
      @click="closeInbox"
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
      @click="closeInbox"
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
      @click="toggleInbox"
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
      :disabled="!hasWorkspaceContext || !messengerState.workspace"
      :title="
        hasWorkspaceContext && messengerState.workspace
          ? '워크스페이스 채팅'
          : '워크스페이스 구성원만 사용할 수 있습니다.'
      "
      :aria-pressed="hasWorkspaceContext ? chatOpen : undefined"
      :aria-controls="
        hasWorkspaceContext ? 'messenger-window' : undefined
      "
      @click="toggleChat"
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
  </nav>
</template>

<style scoped src="../styles/workspace-toolbox.css"></style>
