<script setup lang="ts">
import type { Card } from '../types'

const props = withDefaults(
  defineProps<{
    card: Card
    openable?: boolean
    showDeleteAction?: boolean
  }>(),
  {
    openable: true,
    showDeleteAction: true,
  },
)

const emit = defineEmits<{
  open: [card: Card]
  delete: [cardId: string]
}>()

function formatDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function openCard() {
  if (props.openable) emit('open', props.card)
}
</script>

<template>
  <article class="task-card">
    <div class="card-title-row">
      <span
        class="card-title"
        :class="{ 'card-title--openable': openable }"
        :role="openable ? 'button' : undefined"
        :tabindex="openable ? 0 : undefined"
        @click.stop="openCard"
        @keydown.enter.stop="openCard"
        @keydown.space.prevent.stop="openCard"
      >
        {{ card.title }}
      </span>
      <button
        v-if="showDeleteAction"
        class="card-delete-btn"
        type="button"
        aria-label="카드 삭제"
        @click.stop="emit('delete', card.id)"
      >
        ×
      </button>
    </div>
    <div class="card-meta">
      <span v-if="card.deadline" class="card-date">{{ formatDate(card.deadline) }}</span>
    </div>
  </article>
</template>

<style scoped src="../styles/task-card.css"></style>
