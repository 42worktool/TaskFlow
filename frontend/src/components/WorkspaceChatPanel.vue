<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChatAPI } from '../api/chat'
import { ListAPI } from '../api/list'
import { authState } from '../services/auth'
import {
  clearExternalCardDropHover,
  messengerState,
  requestChatCardAttachment,
  setExternalCardDropHover,
  takePendingChatCardAttachment,
} from '../services/messenger'
import { realtime } from '../services/realtime'
import { parseWorkspaceMessage } from '../services/realtime/protocol'
import type { Card, WorkspaceMessage } from '../types'
import { findDroppedCard, getBoardCardDropId } from '../utils/chatCardDrop'
import { createComposerEnterSubmitter } from '../utils/composerKeyboard'

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
const panelElement = ref<HTMLElement | null>(null)
const messageList = ref<HTMLElement | null>(null)
const composerInput = ref<HTMLTextAreaElement | null>(null)
const cardDropOver = ref(false)
const cardDropPending = ref(false)
const cardLinkError = ref('')
let loadGeneration = 0
let cardLoadGeneration = 0
let cardDragDepth = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const BACKGROUND_REFRESH_RETRIES = 2
const BACKGROUND_RETRY_DELAY_MS = 250

const selectedCard = computed(
  () => cards.value.find((card) => card.id === selectedCardId.value) ?? null,
)
const cardTitles = computed(() => new Map(cards.value.map((card) => [card.id, card.title])))
const acceptsCardDrop = computed(() => getBoardCardDropId(messengerState.cardDrag) !== null)

function mergeMessages(incoming: readonly WorkspaceMessage[]): void {
  const byId = new Map(messages.value.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  messages.value = [...byId.values()]
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
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
    if (generation === loadGeneration && workspaceId === props.workspaceId) {
      mergeMessages(loaded)
    }
  } catch (caught) {
    if (generation !== loadGeneration) return
    error.value = caught instanceof Error ? caught.message : '채팅 메시지를 불러오지 못했습니다.'
    if (background && retriesRemaining > 0 && workspaceId === props.workspaceId) {
      retryTimer = setTimeout(() => {
        retryTimer = null
        void loadMessages(true, retriesRemaining - 1)
      }, BACKGROUND_RETRY_DELAY_MS)
    }
  } finally {
    if (showLoading && generation === loadGeneration) loading.value = false
  }
}

async function loadCards(): Promise<CardOption[] | null> {
  const workspaceId = props.workspaceId
  const generation = ++cardLoadGeneration
  if (!workspaceId) return null
  cardsLoading.value = true
  try {
    const lists = await ListAPI.listByWorkspace(workspaceId)
    const loadedCards = lists.flatMap((list) =>
      list.cards.map((card) => ({ ...card, listName: list.name })),
    )
    if (generation !== cardLoadGeneration || workspaceId !== props.workspaceId) {
      return null
    }
    cards.value = loadedCards
    if (selectedCardId.value && !cards.value.some((card) => card.id === selectedCardId.value)) {
      selectedCardId.value = null
    }
    return loadedCards
  } catch {
    if (generation === cardLoadGeneration) cards.value = []
    return null
  } finally {
    if (generation === cardLoadGeneration) cardsLoading.value = false
  }
}

async function sendMessage(): Promise<void> {
  const workspaceId = props.workspaceId
  const nextContent = content.value.trim()
  // Keep the validated drop/picker selection even if a background card
  // refresh is racing with the submit. The server verifies workspace
  // ownership and writes the message + card comment atomically.
  const cardId = selectedCardId.value
  if (!workspaceId || !nextContent || sending.value) return

  sending.value = true
  error.value = ''
  let sent = false
  try {
    const message = await ChatAPI.send(workspaceId, nextContent, cardId)
    if (workspaceId !== props.workspaceId) return
    mergeMessages([message])
    content.value = ''
    selectedCardId.value = null
    pickerOpen.value = false
    sent = true
  } catch (caught) {
    if (workspaceId !== props.workspaceId) return
    error.value = caught instanceof Error ? caught.message : '메시지를 보내지 못했습니다.'
  } finally {
    if (workspaceId === props.workspaceId) sending.value = false
  }
  if (sent && workspaceId === props.workspaceId) {
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

function chooseCard(cardId: string): void {
  selectedCardId.value = cardId
  cardLinkError.value = ''
  pickerOpen.value = false
}

function toggleCardPicker(): void {
  pickerOpen.value = !pickerOpen.value
  if (pickerOpen.value) void loadCards()
}

function handleCardDragEnter(event: DragEvent): void {
  const cardId = getBoardCardDropId(messengerState.cardDrag)
  if (!cardId) return
  event.preventDefault()
  setExternalCardDropHover(cardId, 'chat', 'chat-panel')
  cardDragDepth += 1
  cardDropOver.value = true
}

function handleCardDragOver(event: DragEvent): void {
  const cardId = getBoardCardDropId(messengerState.cardDrag)
  if (!cardId) return
  event.preventDefault()
  setExternalCardDropHover(cardId, 'chat', 'chat-panel')
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'link'
  cardDropOver.value = true
}

function handleCardDragLeave(): void {
  cardDragDepth = Math.max(0, cardDragDepth - 1)
  if (cardDragDepth !== 0) return
  cardDropOver.value = false
  const cardId = getBoardCardDropId(messengerState.cardDrag)
  if (cardId) clearExternalCardDropHover(cardId, 'chat-panel')
}

function handleCardDrop(event: DragEvent): void {
  const cardId = getBoardCardDropId(messengerState.cardDrag)
  if (!cardId) return

  event.preventDefault()
  event.stopPropagation()
  cardDragDepth = 0
  cardDropOver.value = false
  requestChatCardAttachment(cardId, 'chat-panel')
}

async function attachCard(cardId: string): Promise<void> {
  const workspaceId = props.workspaceId
  cardLinkError.value = ''
  const cachedCard = findDroppedCard(cards.value, cardId)
  if (cachedCard) {
    selectedCardId.value = cachedCard.id
    pickerOpen.value = false
    await nextTick()
    composerInput.value?.focus()
    return
  }
  cardDropPending.value = true
  try {
    const refreshedCards = await loadCards()
    if (workspaceId !== props.workspaceId) return

    const card = refreshedCards ? findDroppedCard(refreshedCards, cardId) : null
    if (!card) {
      cardLinkError.value = refreshedCards
        ? '이 워크스페이스에서 더 이상 사용할 수 없는 카드입니다.'
        : '카드를 확인하지 못했습니다. 잠시 후 다시 놓아 주세요.'
      return
    }

    selectedCardId.value = card.id
    pickerOpen.value = false
    await nextTick()
    composerInput.value?.focus()
  } finally {
    if (workspaceId === props.workspaceId) cardDropPending.value = false
  }
}

function acceptPendingChatCard(): void {
  const cardId = takePendingChatCardAttachment(props.workspaceId)
  if (cardId) void attachCard(cardId)
}

function isPointInsidePanel(clientX: number, clientY: number): boolean {
  const panel = panelElement.value
  if (!panel) return false
  const bounds = panel.getBoundingClientRect()
  return (
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  )
}

function handleFallbackCardPointerMove(event: MouseEvent | PointerEvent): void {
  const cardId = getBoardCardDropId(messengerState.cardDrag)
  if (!cardId) return
  const inside = isPointInsidePanel(event.clientX, event.clientY)
  cardDropOver.value = inside
  if (inside) {
    setExternalCardDropHover(cardId, 'chat', 'chat-panel')
  } else {
    clearExternalCardDropHover(cardId, 'chat-panel')
  }
}

function handleFallbackCardPointerUp(event: MouseEvent | PointerEvent): void {
  const cardId = getBoardCardDropId(messengerState.cardDrag)
  if (!cardId) return
  const inside = isPointInsidePanel(event.clientX, event.clientY)
  cardDropOver.value = false
  cardDragDepth = 0
  if (inside) {
    requestChatCardAttachment(cardId, 'chat-panel')
  } else {
    clearExternalCardDropHover(cardId, 'chat-panel')
  }
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

const removeMessageListener = realtime.on('workspace.message_created', (value) => {
  const message = parseWorkspaceMessage(value)
  if (!message || message.workspace_id !== props.workspaceId) return
  mergeMessages([message])
})

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
    cardDropOver.value = false
    cardDropPending.value = false
    cardLinkError.value = ''
    cardDragDepth = 0
    error.value = ''
    loading.value = true
    sending.value = false
    composerSubmitter.reset()
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

watch(
  () => messengerState.pendingChatCardAttachment,
  (pending) => {
    if (pending?.workspaceId === props.workspaceId) acceptPendingChatCard()
  },
  { immediate: true },
)

watch(
  () => messengerState.cardDrag,
  (drag, previous) => {
    if (drag?.source === 'board') return
    if (previous?.source === 'board') {
      clearExternalCardDropHover(previous.cardId, 'chat-panel')
    }
    cardDragDepth = 0
    cardDropOver.value = false
  },
)

onMounted(() => {
  window.addEventListener('pointermove', handleFallbackCardPointerMove, true)
  window.addEventListener('mousemove', handleFallbackCardPointerMove, true)
  window.addEventListener('pointerup', handleFallbackCardPointerUp, true)
  window.addEventListener('mouseup', handleFallbackCardPointerUp, true)
})

onUnmounted(() => {
  loadGeneration += 1
  cardLoadGeneration += 1
  composerSubmitter.reset()
  if (retryTimer) clearTimeout(retryTimer)
  removeMessageListener()
  const cardId = getBoardCardDropId(messengerState.cardDrag)
  if (cardId) clearExternalCardDropHover(cardId, 'chat-panel')
  window.removeEventListener('pointermove', handleFallbackCardPointerMove, true)
  window.removeEventListener('mousemove', handleFallbackCardPointerMove, true)
  window.removeEventListener('pointerup', handleFallbackCardPointerUp, true)
  window.removeEventListener('mouseup', handleFallbackCardPointerUp, true)
})
</script>

<template>
  <section
    ref="panelElement"
    class="workspace-chat-panel relative min-h-0 h-full flex flex-col bg-slate-50"
    :class="{
      'workspace-chat-panel--card-drop-ready': acceptsCardDrop,
      'workspace-chat-panel--card-drop-over': cardDropOver,
    }"
    aria-label="워크스페이스 채팅"
    @dragenter="handleCardDragEnter"
    @dragover="handleCardDragOver"
    @dragleave="handleCardDragLeave"
    @drop.capture="handleCardDrop"
  >
    <div class="workspace-chat-room min-h-13.5 py-2.25 px-3.5 border-b border-gray-200 flex items-center justify-between gap-3 bg-white">
      <div>
        <strong class="block text-gray-900 text-sm"># {{ workspaceName || '워크스페이스' }}</strong>
        <span class="workspace-chat-room-subtitle block mt-0.5 text-slate-500">구성원 공용 대화방</span>
      </div>
    </div>

    <div class="workspace-chat-messages-region relative min-h-45 flex-1 overflow-hidden">
      <div ref="messageList" class="workspace-chat-messages h-full min-h-0 py-4 px-3.5 overflow-y-auto" aria-live="polite">
        <p v-if="loading" class="workspace-chat-state grid min-h-full m-0 place-items-center text-slate-400">
          메시지를 불러오는 중…
        </p>
        <p v-else-if="!error && messages.length === 0" class="workspace-chat-state grid min-h-full m-0 place-items-center text-slate-400">
          아직 메시지가 없습니다.
        </p>
        <article
          v-for="message in messages"
          :key="message.id"
          class="workspace-chat-message flex items-start gap-2 mb-3.5"
          :class="{
            'workspace-chat-message--mine ml-auto flex-row-reverse': message.author.user_id === authState.user?.id,
          }"
        >
          <img
            v-if="message.author.profile_image_url"
            :src="message.author.profile_image_url"
            alt=""
            class="workspace-chat-avatar w-7 h-7 shrink-0 grow-0 basis-7 rounded-full object-cover"
            referrerpolicy="no-referrer"
          />
          <div
            v-else
            class="workspace-chat-avatar w-7 h-7 shrink-0 grow-0 basis-7 rounded-full grid place-items-center bg-blue-600 text-white font-bold"
          >
            {{ message.author.name.charAt(0).toUpperCase() }}
          </div>
          <div class="workspace-chat-message-body min-w-0">
            <div
              class="workspace-chat-message-meta flex items-baseline gap-1.5 mb-0.75"
              :class="{ 'justify-end': message.author.user_id === authState.user?.id }"
            >
              <strong class="text-slate-600">{{ message.author.name }}</strong>
              <time class="text-slate-400" :datetime="message.created_at">
                {{ formatMessageTime(message.created_at) }}
              </time>
            </div>
            <p>{{ message.content }}</p>
            <button
              v-if="message.card_id && cardTitles.has(message.card_id)"
              type="button"
              class="workspace-chat-card-link inline-block max-w-full mt-1.25 py-1 px-2 overflow-hidden border border-blue-200 rounded-full bg-blue-50 text-blue-700 font-bold text-ellipsis whitespace-nowrap"
              @click="openLinkedCard(message.card_id)"
            >
              ▣ {{ cardTitles.get(message.card_id) }}
            </button>
            <span
              v-else
              class="workspace-chat-card-link workspace-chat-card-link-error inline-block max-w-full mt-1.25 py-1 px-2 overflow-hidden border border-blue-200 rounded-full bg-blue-50 text-red-700 font-bold text-ellipsis whitespace-nowrap"
            >
              ▣ 카드 삭제됨
            </span>
          </div>
        </article>
      </div>
    </div>

    <p v-if="error" class="workspace-chat-error mt-0 py-1.75 px-3.5 bg-red-50 text-red-700" role="alert">
      {{ error }}
    </p>

    <form class="workspace-chat-composer relative pt-2.5 px-3 pb-3 border-t border-gray-200 bg-white" @submit.prevent="sendMessage">
      <p v-if="cardLinkError" class="workspace-chat-card-link-error text-red-700" role="alert">
        {{ cardLinkError }}
      </p>
      <div
        v-if="selectedCard"
        class="workspace-chat-selected-card flex items-center gap-1.5 mb-1.75 py-1.75 px-2.25 rounded-lg bg-blue-50 text-blue-700 font-bold"
      >
        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">▣ {{ selectedCard.title }}</span>
        <button
          type="button"
          class="border-0 bg-transparent text-blue-700 text-base"
          aria-label="카드 연결 해제"
          @click="selectedCardId = null"
        >
          ×
        </button>
        <small class="workspace-chat-selected-card-hint ml-auto text-slate-500 font-medium whitespace-nowrap">
          이 메시지는 카드 댓글에도 기록됩니다.
        </small>
      </div>
      <div class="workspace-chat-input-drop-region relative">
        <textarea
          ref="composerInput"
          v-model="content"
          rows="2"
          maxlength="1000"
          placeholder="메시지를 입력하세요."
          :disabled="loading || sending"
          @keydown.enter.exact="composerSubmitter.handleEnter"
          @compositionend="composerSubmitter.handleCompositionEnd"
        />
        <div
          v-if="acceptsCardDrop || cardDropPending"
          class="workspace-chat-card-drop-hint"
          role="status"
        >
          <strong class="text-xs">
            {{ cardDropPending ? '카드를 확인하는 중…' : '카드를 댓글에 연결' }}
          </strong>
          <span>
            {{
              cardDropPending
                ? '현재 워크스페이스의 카드인지 확인하고 있습니다.'
                : '채팅 어디에 놓아도 이 메시지에 카드가 연결됩니다.'
            }}
          </span>
        </div>
      </div>
      <div class="workspace-chat-composer-actions flex items-center justify-between gap-2 mt-1.75">
        <div class="workspace-chat-card-picker relative">
          <button
            type="button"
            class="chat-attach-button border-0 font-bold py-1.75 px-2.25 bg-slate-100 text-slate-600 disabled:cursor-default disabled:opacity-50"
            :aria-expanded="pickerOpen"
            :disabled="cardsLoading || sending"
            @click="toggleCardPicker"
          >
            ▣ 카드 연결
          </button>
          <div v-if="pickerOpen" class="workspace-chat-card-options">
            <p v-if="cards.length === 0" class="m-0 p-3 text-slate-500 text-xs">
              {{ cardsLoading ? '카드를 불러오는 중…' : '연결할 카드가 없습니다.' }}
            </p>
            <button
              v-for="card in cards"
              :key="card.id"
              type="button"
              class="workspace-chat-card-option-btn w-full py-2 px-2.25 border-0 bg-transparent text-left hover:bg-blue-50"
              @click="chooseCard(card.id)"
            >
              <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-gray-800 text-xs font-semibold">{{
                card.title
              }}</span>
              <small class="workspace-chat-card-option-list block overflow-hidden text-ellipsis whitespace-nowrap mt-0.5 text-slate-400">{{
                card.listName
              }}</small>
            </button>
          </div>
        </div>
        <button
          type="submit"
          class="chat-send-button border-0 font-bold py-1.75 px-3 bg-blue-600 text-white disabled:cursor-default disabled:opacity-50"
          :disabled="loading || sending || !content.trim()"
        >
          {{ sending ? '전송 중…' : '보내기' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped src="../styles/workspace-chat.css"></style>
