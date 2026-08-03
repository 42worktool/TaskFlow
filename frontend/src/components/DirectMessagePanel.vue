<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { FriendAPI } from '../api/friend'
import { authState } from '../services/auth'
import { realtime } from '../services/realtime'
import { parseDirectMessage } from '../services/realtime/protocol'
import type { DirectMessage } from '../types'
import { createComposerEnterSubmitter } from '../utils/composerKeyboard'

const props = withDefaults(
  defineProps<{
    friendId: string
    friendName?: string
    friendProfileImageUrl?: string | null
    friendOnline?: boolean
  }>(),
  {
    friendName: '',
    friendProfileImageUrl: null,
    friendOnline: false,
  },
)

const messages = ref<DirectMessage[]>([])
const content = ref('')
const loading = ref(true)
const sending = ref(false)
const error = ref('')
const messageList = ref<HTMLElement | null>(null)
const composerInput = ref<HTMLTextAreaElement | null>(null)
let loadGeneration = 0

function belongsToCurrentConversation(message: DirectMessage): boolean {
  const currentUserId = authState.user?.id
  if (!currentUserId || !props.friendId) return false
  const participantIds = [
    message.author.user_id,
    message.recipient.user_id,
  ]
  return (
    participantIds.includes(currentUserId) &&
    participantIds.includes(props.friendId)
  )
}

function mergeMessages(incoming: readonly DirectMessage[]): void {
  const byId = new Map(messages.value.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  messages.value = [...byId.values()]
    .sort(
      (left, right) =>
        Date.parse(left.created_at) - Date.parse(right.created_at) ||
        left.id.localeCompare(right.id),
    )
    .slice(-100)

  void nextTick(() => {
    if (messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight
    }
  })
}

async function loadMessages(background = false): Promise<void> {
  const friendId = props.friendId
  const generation = ++loadGeneration
  if (!friendId) return

  if (!background) loading.value = true
  error.value = ''
  try {
    const loaded = await FriendAPI.listMessages(friendId)
    if (generation !== loadGeneration || friendId !== props.friendId) return
    mergeMessages(loaded)
  } catch (caught) {
    if (generation !== loadGeneration || friendId !== props.friendId) return
    error.value =
      caught instanceof Error
        ? caught.message
        : '대화 내용을 불러오지 못했습니다.'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function sendMessage(): Promise<void> {
  const friendId = props.friendId
  const nextContent = content.value.trim()
  if (!friendId || !nextContent || sending.value) return

  sending.value = true
  error.value = ''
  try {
    const message = await FriendAPI.sendMessage(friendId, nextContent)
    if (friendId !== props.friendId) return
    mergeMessages([message])
    content.value = ''
    await nextTick()
    composerInput.value?.focus()
  } catch (caught) {
    if (friendId !== props.friendId) return
    error.value =
      caught instanceof Error ? caught.message : '메시지를 보내지 못했습니다.'
  } finally {
    if (friendId === props.friendId) sending.value = false
  }
}

const composerSubmitter = createComposerEnterSubmitter(
  () => {
    void sendMessage()
  },
  (callback) => {
    void nextTick(callback)
  },
)

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const removeMessageListener = realtime.on('dm.message_created', (value) => {
  const message = parseDirectMessage(value)
  if (!message || !belongsToCurrentConversation(message)) return
  mergeMessages([message])
})

const removeRealtimeStateListener = realtime.onStateChange((state) => {
  if (state === 'connected' && props.friendId) void loadMessages(true)
})

watch(
  () => props.friendId,
  (friendId) => {
    loadGeneration += 1
    messages.value = []
    content.value = ''
    error.value = ''
    loading.value = true
    sending.value = false
    composerSubmitter.reset()
    if (friendId) void loadMessages()
  },
  { immediate: true },
)

onUnmounted(() => {
  loadGeneration += 1
  composerSubmitter.reset()
  removeMessageListener()
  removeRealtimeStateListener()
})
</script>

<template>
  <section class="direct-message-panel" aria-label="친구 다이렉트 메시지">
    <header class="direct-message-header">
      <div class="direct-message-person">
        <div class="direct-message-avatar-wrap">
          <img
            v-if="friendProfileImageUrl"
            :src="friendProfileImageUrl"
            alt=""
            class="direct-message-avatar"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="direct-message-avatar direct-message-avatar--fallback"
            aria-hidden="true"
          >
            {{ (friendName || '?').charAt(0).toUpperCase() }}
          </span>
          <span
            class="direct-message-presence-dot"
            :class="{ 'direct-message-presence-dot--online': friendOnline }"
            aria-hidden="true"
          />
        </div>
        <div>
          <strong>{{ friendName || '친구' }}</strong>
          <span :class="{ 'direct-message-status--online': friendOnline }">
            {{ friendOnline ? '온라인' : '오프라인' }}
          </span>
        </div>
      </div>
    </header>

    <div ref="messageList" class="direct-message-list" aria-live="polite">
      <p v-if="loading" class="direct-message-state">
        대화 내용을 불러오는 중…
      </p>
      <p
        v-else-if="!error && messages.length === 0"
        class="direct-message-state"
      >
        아직 메시지가 없습니다. 먼저 인사를 건네 보세요.
      </p>
      <article
        v-for="message in messages"
        :key="message.id"
        class="direct-message"
        :class="{
          'direct-message--mine': message.author.user_id === authState.user?.id,
        }"
      >
        <img
          v-if="message.author.profile_image_url"
          :src="message.author.profile_image_url"
          alt=""
          class="direct-message-message-avatar"
          referrerpolicy="no-referrer"
        />
        <span
          v-else
          class="direct-message-message-avatar direct-message-avatar--fallback"
          aria-hidden="true"
        >
          {{ message.author.name.charAt(0).toUpperCase() }}
        </span>
        <div class="direct-message-body">
          <div class="direct-message-meta">
            <strong>{{ message.author.name }}</strong>
            <time :datetime="message.created_at">
              {{ formatMessageTime(message.created_at) }}
            </time>
          </div>
          <p>{{ message.content }}</p>
        </div>
      </article>
    </div>

    <p v-if="error" class="direct-message-error" role="alert">
      {{ error }}
    </p>

    <form class="direct-message-composer" @submit.prevent="sendMessage">
      <textarea
        ref="composerInput"
        v-model="content"
        rows="2"
        maxlength="1000"
        :placeholder="`${friendName || '친구'}에게 메시지 보내기`"
        :disabled="loading || sending"
        @keydown.enter.exact="composerSubmitter.handleEnter"
        @compositionend="composerSubmitter.handleCompositionEnd"
      />
      <button
        type="submit"
        :disabled="loading || sending || !content.trim()"
      >
        {{ sending ? '전송 중…' : '보내기' }}
      </button>
    </form>
  </section>
</template>

<style scoped src="../styles/direct-message.css"></style>
