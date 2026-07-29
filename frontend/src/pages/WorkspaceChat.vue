<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ChatAPI } from '../api/chat'
import { authState } from '../services/auth'
import { realtime } from '../services/realtime'
import { parseWorkspaceMessage } from '../services/realtime/protocol'
import type { WorkspaceMessage } from '../types'

const props = withDefaults(
  defineProps<{
    workspaceSyncVersion?: number
  }>(),
  { workspaceSyncVersion: 0 },
)

const route = useRoute()
const messages = ref<WorkspaceMessage[]>([])
const content = ref('')
const loading = ref(true)
const sending = ref(false)
const error = ref('')
const messageList = ref<HTMLElement | null>(null)
let loadGeneration = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const BACKGROUND_REFRESH_RETRIES = 2
const BACKGROUND_RETRY_DELAY_MS = 250

function mergeMessages(incoming: readonly WorkspaceMessage[]): void {
  const byId = new Map(messages.value.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  messages.value = [...byId.values()]
    .sort(
      (left, right) =>
        Date.parse(left.created_at) - Date.parse(right.created_at),
    )
    .slice(-100)
  void nextTick(() => {
    if (messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight
    }
  })
}

async function loadMessages(
  background = false,
  retriesRemaining = background ? BACKGROUND_REFRESH_RETRIES : 0,
): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  const generation = ++loadGeneration
  const workspaceId = String(route.params.workspaceId ?? '')
  if (!workspaceId) return

  const showLoading = !background || loading.value
  if (showLoading) loading.value = true
  error.value = ''
  try {
    const loaded = await ChatAPI.list(workspaceId)
    if (
      generation === loadGeneration &&
      workspaceId === String(route.params.workspaceId ?? '')
    ) {
      mergeMessages(loaded)
    }
  } catch (caught) {
    if (generation !== loadGeneration) return
    error.value =
      caught instanceof Error
        ? caught.message
        : '채팅 메시지를 불러오지 못했습니다.'
    if (
      background &&
      retriesRemaining > 0 &&
      workspaceId === String(route.params.workspaceId ?? '')
    ) {
      retryTimer = setTimeout(() => {
        retryTimer = null
        void loadMessages(true, retriesRemaining - 1)
      }, BACKGROUND_RETRY_DELAY_MS)
    }
  } finally {
    if (showLoading && generation === loadGeneration) loading.value = false
  }
}

async function sendMessage(): Promise<void> {
  const workspaceId = String(route.params.workspaceId ?? '')
  const nextContent = content.value.trim()
  if (!workspaceId || !nextContent || sending.value) return

  sending.value = true
  error.value = ''
  try {
    const message = await ChatAPI.send(workspaceId, nextContent)
    mergeMessages([message])
    content.value = ''
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '메시지를 보내지 못했습니다.'
  } finally {
    sending.value = false
  }
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const removeMessageListener = realtime.on(
  'workspace.message_created',
  (value) => {
    const message = parseWorkspaceMessage(value)
    if (
      !message ||
      message.workspace_id !== String(route.params.workspaceId ?? '')
    ) {
      return
    }
    mergeMessages([message])
  },
)

watch(
  () => String(route.params.workspaceId ?? ''),
  (workspaceId) => {
    loadGeneration += 1
    messages.value = []
    content.value = ''
    error.value = ''
    loading.value = true
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (workspaceId) void loadMessages()
  },
  { immediate: true },
)

watch(
  () => props.workspaceSyncVersion,
  (next, previous) => {
    if (next !== previous) void loadMessages(true)
  },
)

onUnmounted(() => {
  loadGeneration += 1
  if (retryTimer) clearTimeout(retryTimer)
  removeMessageListener()
})
</script>

<template>
  <main class="workspace-chat-page">
    <header class="workspace-chat-header">
      <div>
        <h1>워크스페이스 채팅</h1>
        <p>현재 워크스페이스 구성원 모두가 참여하는 기본 채팅방입니다.</p>
      </div>
      <button
        type="button"
        class="chat-refresh-button"
        :disabled="loading || sending"
        @click="loadMessages(true)"
      >
        새로고침
      </button>
    </header>

    <section
      ref="messageList"
      class="workspace-chat-messages"
      aria-live="polite"
    >
      <p v-if="loading" class="workspace-chat-state">
        메시지를 불러오는 중…
      </p>
      <p
        v-else-if="!error && messages.length === 0"
        class="workspace-chat-state"
      >
        아직 메시지가 없습니다. 첫 메시지를 남겨 보세요.
      </p>
      <article
        v-for="message in messages"
        :key="message.id"
        class="workspace-chat-message"
        :class="{
          'workspace-chat-message--mine':
            message.author.user_id === authState.user?.id,
        }"
      >
        <img
          v-if="message.author.profile_image_url"
          :src="message.author.profile_image_url"
          alt=""
          class="workspace-chat-avatar"
          referrerpolicy="no-referrer"
        />
        <div v-else class="workspace-chat-avatar workspace-chat-avatar--fallback">
          {{ message.author.name.charAt(0).toUpperCase() }}
        </div>
        <div class="workspace-chat-message-body">
          <div class="workspace-chat-message-meta">
            <strong>{{ message.author.name }}</strong>
            <time :datetime="message.created_at">
              {{ formatMessageTime(message.created_at) }}
            </time>
          </div>
          <p>{{ message.content }}</p>
        </div>
      </article>
    </section>

    <p v-if="error" class="workspace-chat-error" role="alert">
      {{ error }}
    </p>

    <form class="workspace-chat-composer" @submit.prevent="sendMessage">
      <textarea
        v-model="content"
        rows="2"
        maxlength="1000"
        placeholder="메시지를 입력하세요."
        :disabled="loading || sending"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <button
        type="submit"
        :disabled="loading || sending || !content.trim()"
      >
        {{ sending ? '전송 중…' : '보내기' }}
      </button>
    </form>
  </main>
</template>

<style scoped src="../styles/workspace-chat.css"></style>
