<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChatAPI } from '../api/chat'
import { ListAPI } from '../api/list'
import { authState } from '../services/auth'
import { realtime } from '../services/realtime'
import { parseWorkspaceMessage } from '../services/realtime/protocol'
import type { Card, WorkspaceMessage } from '../types'

interface CardOption extends Card {
  listName: string
}

const props = withDefaults(
  defineProps<{
    workspaceId: string
    workspaceName?: string
    workspaceSyncVersion?: number
  }>(),
  { workspaceName: '', workspaceSyncVersion: 0 },
)

const router = useRouter()
const messages = ref<WorkspaceMessage[]>([])
const cards = ref<CardOption[]>([])
const content = ref('')
const selectedCardId = ref<string | null>(null)
const pickerOpen = ref(false)
const loading = ref(true)
const cardsLoading = ref(false)
const sending = ref(false)
const error = ref('')
const messageList = ref<HTMLElement | null>(null)
let loadGeneration = 0
let cardLoadGeneration = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const BACKGROUND_REFRESH_RETRIES = 2
const BACKGROUND_RETRY_DELAY_MS = 250

const selectedCard = computed(
  () => cards.value.find((card) => card.id === selectedCardId.value) ?? null,
)
const cardTitles = computed(
  () => new Map(cards.value.map((card) => [card.id, card.title])),
)

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
  const workspaceId = props.workspaceId
  const generation = ++loadGeneration
  if (!workspaceId) return

  const showLoading = !background || loading.value
  if (showLoading) loading.value = true
  error.value = ''
  try {
    const loaded = await ChatAPI.list(workspaceId)
    if (
      generation === loadGeneration &&
      workspaceId === props.workspaceId
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
      workspaceId === props.workspaceId
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

async function loadCards(): Promise<void> {
  const workspaceId = props.workspaceId
  const generation = ++cardLoadGeneration
  if (!workspaceId) return
  cardsLoading.value = true
  try {
    const lists = await ListAPI.listByWorkspace(workspaceId)
    if (
      generation !== cardLoadGeneration ||
      workspaceId !== props.workspaceId
    ) {
      return
    }
    cards.value = lists.flatMap((list) =>
      list.cards.map((card) => ({ ...card, listName: list.name })),
    )
    if (
      selectedCardId.value &&
      !cards.value.some((card) => card.id === selectedCardId.value)
    ) {
      selectedCardId.value = null
    }
  } catch {
    if (generation === cardLoadGeneration) cards.value = []
  } finally {
    if (generation === cardLoadGeneration) cardsLoading.value = false
  }
}

async function sendMessage(): Promise<void> {
  const workspaceId = props.workspaceId
  const nextContent = content.value.trim()
  const cardId = selectedCardId.value
  if (!workspaceId || !nextContent || sending.value) return

  sending.value = true
  error.value = ''
  try {
    const message = await ChatAPI.send(workspaceId, nextContent, cardId)
    if (workspaceId !== props.workspaceId) return
    mergeMessages([message])
    content.value = ''
    selectedCardId.value = null
    pickerOpen.value = false
  } catch (caught) {
    if (workspaceId !== props.workspaceId) return
    error.value =
      caught instanceof Error ? caught.message : '메시지를 보내지 못했습니다.'
  } finally {
    if (workspaceId === props.workspaceId) sending.value = false
  }
}

function chooseCard(cardId: string): void {
  selectedCardId.value = cardId
  pickerOpen.value = false
}

function toggleCardPicker(): void {
  pickerOpen.value = !pickerOpen.value
  if (pickerOpen.value) void loadCards()
}

function openLinkedCard(cardId: string): void {
  void router.push({
    path: `/workspaces/${props.workspaceId}/board`,
    query: { card: cardId },
  })
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
    if (!message || message.workspace_id !== props.workspaceId) return
    mergeMessages([message])
  },
)

watch(
  () => props.workspaceId,
  (workspaceId) => {
    loadGeneration += 1
    cardLoadGeneration += 1
    messages.value = []
    cards.value = []
    content.value = ''
    selectedCardId.value = null
    pickerOpen.value = false
    error.value = ''
    loading.value = true
    sending.value = false
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (workspaceId) {
      void loadMessages()
      void loadCards()
    }
  },
  { immediate: true },
)

watch(
  () => props.workspaceSyncVersion,
  (next, previous) => {
    if (next === previous) return
    void loadMessages(true)
    void loadCards()
  },
)

onUnmounted(() => {
  loadGeneration += 1
  cardLoadGeneration += 1
  if (retryTimer) clearTimeout(retryTimer)
  removeMessageListener()
})
</script>

<template>
  <section class="workspace-chat-panel" aria-label="워크스페이스 채팅">
    <div class="workspace-chat-room">
      <div>
        <strong># {{ workspaceName || '워크스페이스' }}</strong>
        <span>구성원 공용 대화방</span>
      </div>
      <button
        type="button"
        class="chat-refresh-button"
        :disabled="loading || sending"
        aria-label="채팅 새로고침"
        @click="loadMessages(true)"
      >
        ↻
      </button>
    </div>

    <div ref="messageList" class="workspace-chat-messages" aria-live="polite">
      <p v-if="loading" class="workspace-chat-state">
        메시지를 불러오는 중…
      </p>
      <p
        v-else-if="!error && messages.length === 0"
        class="workspace-chat-state"
      >
        아직 메시지가 없습니다.
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
          <button
            v-if="message.card_id"
            type="button"
            class="workspace-chat-card-link"
            @click="openLinkedCard(message.card_id)"
          >
            ▣ {{ cardTitles.get(message.card_id) ?? '연결된 카드' }}
          </button>
        </div>
      </article>
    </div>

    <p v-if="error" class="workspace-chat-error" role="alert">
      {{ error }}
    </p>

    <form class="workspace-chat-composer" @submit.prevent="sendMessage">
      <div v-if="selectedCard" class="workspace-chat-selected-card">
        <span>▣ {{ selectedCard.title }}</span>
        <button
          type="button"
          aria-label="카드 연결 해제"
          @click="selectedCardId = null"
        >
          ×
        </button>
        <small>이 메시지는 카드 댓글에도 기록됩니다.</small>
      </div>
      <textarea
        v-model="content"
        rows="2"
        maxlength="1000"
        placeholder="메시지를 입력하세요."
        :disabled="loading || sending"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <div class="workspace-chat-composer-actions">
        <div class="workspace-chat-card-picker">
          <button
            type="button"
            class="chat-attach-button"
            :aria-expanded="pickerOpen"
            :disabled="cardsLoading || sending"
            @click="toggleCardPicker"
          >
            ▣ 카드 연결
          </button>
          <div v-if="pickerOpen" class="workspace-chat-card-options">
            <p v-if="cards.length === 0">
              {{ cardsLoading ? '카드를 불러오는 중…' : '연결할 카드가 없습니다.' }}
            </p>
            <button
              v-for="card in cards"
              :key="card.id"
              type="button"
              @click="chooseCard(card.id)"
            >
              <span>{{ card.title }}</span>
              <small>{{ card.listName }}</small>
            </button>
          </div>
        </div>
        <button
          type="submit"
          class="chat-send-button"
          :disabled="loading || sending || !content.trim()"
        >
          {{ sending ? '전송 중…' : '보내기' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped src="../styles/workspace-chat.css"></style>
