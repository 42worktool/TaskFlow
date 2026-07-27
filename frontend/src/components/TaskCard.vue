<script setup lang="ts">
import type { Card } from '../types'

defineProps<{
  card: Card
}>()

const emit = defineEmits<{
  delete: [cardId: string]
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
      <span v-if="card.deadline" class="card-date">{{ formatDate(card.deadline) }}</span>
      <div class="card-assignee" />
    </div>
  </article>
</template>

<style scoped src="../styles/task-card.css"></style>
