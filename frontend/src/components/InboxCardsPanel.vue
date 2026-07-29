<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TaskCard from './TaskCard.vue'
import { InboxAPI } from '../api/inbox'
import type { Card } from '../types'

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const cards = ref<Card[]>([])
const loading = ref(true)
const error = ref('')
let deletingCardId: string | null = null

async function loadInbox() {
  loading.value = true
  error.value = ''
  try {
    cards.value = await InboxAPI.list()
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '인박스를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

async function deleteCard(cardId: string) {
  if (deletingCardId) return
  deletingCardId = cardId
  error.value = ''
  try {
    await InboxAPI.remove(cardId)
    cards.value = cards.value.filter((card) => card.id !== cardId)
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '인박스 카드를 삭제하지 못했습니다.'
  } finally {
    deletingCardId = null
  }
}

onMounted(() => {
  void loadInbox()
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
        <TaskCard :card="card" @delete="deleteCard" />
      </li>
    </ul>
  </section>
</template>

<style scoped src="../styles/inbox-cards-panel.css"></style>
