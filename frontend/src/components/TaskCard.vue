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
  open: [card: Card]
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
      <span
        class="card-title"
        role="button"
        tabindex="0"
        @click.stop="emit('open', card)"
        @keydown.enter.stop="emit('open', card)"
        @keydown.space.prevent.stop="emit('open', card)"
      >
        {{ card.title }}
      </span>
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
    </div>
  </article>
</template>

<style scoped src="../styles/task-card.css"></style>
