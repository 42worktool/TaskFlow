<script setup lang="ts">
import type { Card } from '../types'

withDefaults(
  defineProps<{
    card: Card
    showInboxAction?: boolean
  }>(),
  {
    showInboxAction: false,
  },
)

const emit = defineEmits<{
  delete: [cardId: string]
  'move-to-inbox': [cardId: string]
}>()

function formatDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <article class="task-card">
    <div class="card-title-row">
      <p class="card-title">{{ card.title }}</p>
      <button
        class="card-delete-btn"
        type="button"
        aria-label="카드 삭제"
        @click.stop="emit('delete', card.id)"
      >
        ×
      </button>
    </div>
    <div class="card-meta">
      <button
        v-if="showInboxAction"
        class="card-inbox-btn"
        type="button"
        @click.stop="emit('move-to-inbox', card.id)"
      >
        인박스
      </button>
      <span v-if="card.deadline" class="card-date">{{ formatDate(card.deadline) }}</span>
      <div class="card-assignee" />
    </div>
  </article>
</template>

<style scoped src="../styles/task-card.css"></style>
