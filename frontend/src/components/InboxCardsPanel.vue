<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import CardDetailModal from './CardDetailModal.vue'
import TaskCard from './TaskCard.vue'
import { InboxAPI } from '../api/inbox'
import type { Card, List } from '../types'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    destinationLists?: Pick<List, 'id' | 'name'>[]
    refreshToken?: number
  }>(),
  {
    compact: false,
    destinationLists: () => [],
    refreshToken: 0,
  },
)

const emit = defineEmits<{
  moved: [card: Card]
}>()

const cards = ref<Card[]>([])
const loading = ref(true)
const error = ref('')
const destinationListId = ref('')
const busyCardId = ref<string | null>(null)
const selectedCardId = ref<string | null>(null)
let inboxLoadGeneration = 0

watch(
  () => props.destinationLists.map((list) => list.id),
  (listIds) => {
    if (listIds.length > 0 && !listIds.includes(destinationListId.value)) {
      destinationListId.value = listIds[0] ?? ''
    }
  },
  { immediate: true },
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

async function moveCardToBoard(card: Card) {
  if (busyCardId.value || !destinationListId.value) return
  busyCardId.value = card.id
  error.value = ''
  try {
    const moved = await InboxAPI.moveToList(card.id, destinationListId.value)
    cards.value = cards.value.filter((item) => item.id !== card.id)
    emit('moved', moved)
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '카드를 보드로 옮기지 못했습니다.'
  } finally {
    busyCardId.value = null
  }
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
  <section class="inbox-cards-panel" :class="{ 'inbox-cards-panel--compact': compact }">
    <div class="inbox-panel-header">
      <div>
        <h2 class="inbox-panel-title">인박스</h2>
        <p class="inbox-panel-subtitle">보드로 옮길 카드를 모아두는 공간</p>
      </div>
    </div>

    <div class="inbox-panel-toolbar">
      <span class="card-count">카드 {{ cards.length }}개</span>
      <select
        v-if="destinationLists.length"
        v-model="destinationListId"
        class="inbox-destination-select"
        aria-label="인박스 카드가 이동할 리스트"
        :disabled="busyCardId !== null"
      >
        <option v-for="list in destinationLists" :key="list.id" :value="list.id">
          {{ list.name }}
        </option>
      </select>
    </div>

    <p v-if="error" class="inbox-panel-state inbox-panel-state--error" role="alert">
      {{ error }}
    </p>
    <p v-if="loading" class="inbox-panel-state" role="status">
      인박스를 불러오는 중…
    </p>
    <p v-else-if="!error && cards.length === 0" class="inbox-panel-state">
      인박스가 비어 있습니다.
    </p>
    <ul v-else-if="cards.length > 0" class="inbox-card-list">
      <li v-for="card in cards" :key="card.id">
        <TaskCard
          :card="card"
          @open="selectedCardId = card.id"
          @delete="deleteCard"
        />
        <button
          v-if="destinationLists.length"
          class="inbox-card-move-btn"
          type="button"
          :disabled="busyCardId !== null || !destinationListId"
          @click="moveCardToBoard(card)"
        >
          {{ busyCardId === card.id ? '이동 중…' : '선택한 리스트로 이동' }}
        </button>
      </li>
    </ul>
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
