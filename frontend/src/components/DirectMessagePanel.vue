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
  const participantIds = [message.author.user_id, message.recipient.user_id]
  return participantIds.includes(currentUserId) && participantIds.includes(props.friendId)
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
    error.value = caught instanceof Error ? caught.message : '대화 내용을 불러오지 못했습니다.'
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
  let sent = false
  try {
    const message = await FriendAPI.sendMessage(friendId, nextContent)
    if (friendId !== props.friendId) return
    mergeMessages([message])
    content.value = ''
    sent = true
  } catch (caught) {
    if (friendId !== props.friendId) return
    error.value = caught instanceof Error ? caught.message : '메시지를 보내지 못했습니다.'
  } finally {
    if (friendId === props.friendId) sending.value = false
  }
  if (sent && friendId === props.friendId) {
    await nextTick()
    composerInput.value?.focus()
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
  <section
    class="direct-message-panel h-full min-h-0 flex flex-col bg-slate-50 text-gray-900"
    aria-label="친구 다이렉트 메시지"
  >
    <header
      class="direct-message-header min-h-16 py-2.25 px-3.25 border-b border-slate-200 flex items-center justify-between gap-3 bg-white"
    >
      <div class="direct-message-person min-w-0 flex items-center gap-2.5">
        <div class="direct-message-avatar-wrap relative shrink-0 grow-0 basis-10">
          <img
            v-if="friendProfileImageUrl"
            :src="friendProfileImageUrl"
            alt=""
            class="direct-message-avatar w-10 h-10 rounded-full object-cover"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="direct-message-avatar w-10 h-10 rounded-full grid place-items-center bg-blue-600 text-white font-extrabold"
            aria-hidden="true"
          >
            {{ (friendName || '?').charAt(0).toUpperCase() }}
          </span>
          <span
            class="direct-message-presence-dot absolute -right-0.25 -bottom-0.25 w-2.75 h-2.75 border-2 border-white rounded-full bg-slate-400"
            :class="{ 'bg-green-500': friendOnline }"
            aria-hidden="true"
          />
        </div>
        <div class="min-w-0">
          <strong
            class="block overflow-hidden text-gray-900 text-sm text-ellipsis whitespace-nowrap"
            >{{ friendName || '친구' }}</strong
          >
          <span
            class="direct-message-status block mt-0.5 text-slate-500"
            :class="{ 'text-green-700': friendOnline }"
          >
            {{ friendOnline ? '온라인' : '오프라인' }}
          </span>
        </div>
      </div>
    </header>

    <div
      ref="messageList"
      class="direct-message-list min-h-0 flex-1 overflow-y-auto p-3.5"
      aria-live="polite"
    >
      <p v-if="loading" class="direct-message-state my-6 text-slate-500 text-center">
        대화 내용을 불러오는 중…
      </p>
      <p
        v-else-if="!error && messages.length === 0"
        class="direct-message-state my-6 text-slate-500 text-center"
      >
        아직 메시지가 없습니다. 먼저 인사를 건네 보세요.
      </p>
      <article
        v-for="message in messages"
        :key="message.id"
        class="direct-message flex items-start gap-2 mb-3"
        :class="{
          'direct-message--mine flex-row-reverse': message.author.user_id === authState.user?.id,
        }"
      >
        <img
          v-if="message.author.profile_image_url"
          :src="message.author.profile_image_url"
          alt=""
          class="direct-message-message-avatar w-7.5 h-7.5 shrink-0 grow-0 basis-7.5 rounded-full object-cover"
          referrerpolicy="no-referrer"
        />
        <span
          v-else
          class="direct-message-message-avatar w-7.5 h-7.5 shrink-0 grow-0 basis-7.5 rounded-full grid place-items-center bg-blue-600 text-white font-extrabold text-xs"
          aria-hidden="true"
        >
          {{ message.author.name.charAt(0).toUpperCase() }}
        </span>
        <div class="direct-message-body min-w-0">
          <div
            class="direct-message-meta flex items-baseline gap-1.5 mx-1 mb-1 text-slate-500"
            :class="{ 'justify-end': message.author.user_id === authState.user?.id }"
          >
            <strong class="overflow-hidden text-slate-700 text-ellipsis whitespace-nowrap">{{
              message.author.name
            }}</strong>
            <time class="whitespace-nowrap" :datetime="message.created_at">
              {{ formatMessageTime(message.created_at) }}
            </time>
          </div>
          <p>{{ message.content }}</p>
        </div>
      </article>
    </div>

    <p
      v-if="error"
      class="direct-message-error mt-0 py-2 px-3.25 border-t border-red-200 bg-red-50 text-red-700 text-xs"
      role="alert"
    >
      {{ error }}
    </p>

    <form
      class="direct-message-composer p-2.5 border-t border-slate-200 flex items-end gap-2 bg-white"
      @submit.prevent="sendMessage"
    >
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
      <button type="submit" :disabled="loading || sending || !content.trim()">
        {{ sending ? '전송 중…' : '보내기' }}
      </button>
    </form>
  </section>
</template>

<style scoped src="../styles/direct-message.css"></style>
