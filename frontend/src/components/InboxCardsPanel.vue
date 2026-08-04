<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import CardDetailModal from './CardDetailModal.vue'
import TaskCard from './TaskCard.vue'
import { CardAPI } from '../api/card'
import { InboxAPI } from '../api/inbox'
import { isExternalCardDropClaimed } from '../services/messenger'
import type { Card, DraggableChange, List } from '../types'

const props = withDefaults(
  defineProps<{
    allowDrag?: boolean
    destinationLists?: Pick<List, 'id' | 'name'>[]
    refreshToken?: number
    acceptingDrop?: boolean
  }>(),
  {
    allowDrag: true,
    destinationLists: () => [],
    refreshToken: 0,
    acceptingDrop: false,
  },
)

const emit = defineEmits<{
  'drop-settled': []
  'drag-start': [card: Card]
  'drag-end': [movedToBoard: boolean]
}>()

const cards = ref<Card[]>([])
const loading = ref(true)
const error = ref('')
const busyCardId = ref<string | null>(null)
const selectedCardId = ref<string | null>(null)
let inboxLoadGeneration = 0

const dragEnabled = computed(
  () =>
    props.allowDrag &&
    props.destinationLists.length > 0 &&
    busyCardId.value === null,
)

async function loadInbox() {
  const generation = ++inboxLoadGeneration
  loading.value = true
  error.value = ''
  try {
    const loaded = await InboxAPI.list()
    if (generation === inboxLoadGeneration) cards.value = loaded
  } catch (caught) {
    if (generation === inboxLoadGeneration) {
      error.value =
        caught instanceof Error ? caught.message : '인박스를 불러오지 못했습니다.'
    }
  } finally {
    if (generation === inboxLoadGeneration) loading.value = false
  }
}

watch(
  () => props.refreshToken,
  () => {
    void loadInbox()
  },
)

async function deleteCard(cardId: string) {
  if (busyCardId.value) return
  busyCardId.value = cardId
  error.value = ''
  try {
    await InboxAPI.remove(cardId)
    cards.value = cards.value.filter((card) => card.id !== cardId)
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '인박스 카드를 삭제하지 못했습니다.'
  } finally {
    busyCardId.value = null
  }
}

async function toggleCardCompletion(card: Card) {
  if (busyCardId.value) return
  busyCardId.value = card.id
  error.value = ''
  try {
    const saved = await CardAPI.updateCompletion(card.id, !card.is_completed)
    updateSavedCard(saved)
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : card.is_completed
          ? '카드를 다시 열지 못했습니다.'
          : '카드를 완료하지 못했습니다.'
  } finally {
    busyCardId.value = null
  }
}

async function handleCardChange(event: DraggableChange<Card>) {
  if (!event.added || busyCardId.value) return
  const card = event.added.element
  if (isExternalCardDropClaimed(card.id)) {
    cards.value = cards.value.filter((item) => item.id !== card.id)
    emit('drop-settled')
    return
  }
  inboxLoadGeneration += 1
  loading.value = false
  busyCardId.value = card.id
  error.value = ''
  try {
    const moved = await InboxAPI.moveToInbox(card.id)
    cards.value = cards.value.map((item) =>
      item.id === card.id ? moved : item,
    )
  } catch (caught) {
    cards.value = cards.value.filter((item) => item.id !== card.id)
    error.value =
      caught instanceof Error ? caught.message : '카드를 인박스로 옮기지 못했습니다.'
  } finally {
    busyCardId.value = null
    emit('drop-settled')
  }
}

function startInboxDrag(event: { oldIndex?: number | null }) {
  const index = event.oldIndex
  if (index === null || index === undefined) return
  const card = cards.value[index]
  if (card) emit('drag-start', card)
}

function finishInboxDrag(event: { from?: Element; to?: Element }) {
  emit('drag-end', Boolean(event.from && event.to && event.from !== event.to))
}

function updateSavedCard(saved: Card): void {
  cards.value = cards.value.map((card) =>
    card.id === saved.id ? saved : card,
  )
}

onMounted(() => {
  void loadInbox()
})

onUnmounted(() => {
  inboxLoadGeneration += 1
})
</script>

<template>
  <section class="inbox-cards-panel">
    <div class="inbox-panel-header">
      <div>
        <h2 class="inbox-panel-title">인박스</h2>
        <p class="inbox-panel-subtitle">보드 밖에 보관 중인 내 카드</p>
      </div>
    </div>

    <div class="inbox-panel-toolbar">
      <span class="card-count">카드 {{ cards.length }}개</span>
      <span
        v-if="allowDrag && destinationLists.length"
        class="inbox-drag-hint"
      >
        카드를 보드 리스트로 드래그하세요
      </span>
    </div>

    <p v-if="error" class="inbox-panel-state inbox-panel-state--error" role="alert">
      {{ error }}
    </p>
    <draggable
      v-model="cards"
      tag="ul"
      item-key="id"
      class="inbox-card-list"
      :class="{ 'inbox-card-list--drop-active': acceptingDrop }"
      :group="{ name: 'board-cards', pull: dragEnabled, put: dragEnabled }"
      :disabled="!dragEnabled"
      :sort="false"
      ghost-class="card-ghost"
      :force-fallback="true"
      :scroll="true"
      :scroll-sensitivity="80"
      :scroll-speed="12"
      :bubble-scroll="true"
      :force-auto-scroll-fallback="true"
      :fallback-on-body="true"
      @start="startInboxDrag"
      @end="finishInboxDrag"
      @change="handleCardChange"
    >
      <template #item="{ element: card }">
        <li>
          <TaskCard
            :card="card"
            :openable="true"
            :show-delete-action="true"
            :show-completion-action="true"
            :completed="card.is_completed"
            :completion-pending="busyCardId === card.id"
            @open="selectedCardId = card.id"
            @delete="deleteCard"
            @toggle-completion="toggleCardCompletion"
          />
        </li>
      </template>
      <template #footer>
        <li
          v-if="acceptingDrop"
          class="inbox-drop-prompt"
          aria-hidden="true"
        >
          여기에 놓아 인박스로 이동
        </li>
        <li
          v-else-if="loading"
          class="inbox-panel-state"
          role="status"
        >
          인박스를 불러오는 중…
        </li>
        <li
          v-else-if="!error && cards.length === 0"
          class="inbox-panel-state"
        >
          인박스가 비어 있습니다.
        </li>
      </template>
    </draggable>
  </section>
  <CardDetailModal
    v-if="selectedCardId"
    :card-id="selectedCardId"
    :editable="true"
    @saved="updateSavedCard"
    @close="selectedCardId = null"
  />
</template>

<style scoped src="../styles/inbox-cards-panel.css"></style>
