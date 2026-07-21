<script setup lang="ts">
import type { Card } from '../types'

defineProps<{
  card: Card
}>()

function formatDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <article class="task-card">
    <p class="card-title">{{ card.title }}</p>
    <div class="card-meta">
      <span
        v-if="card.label"
        class="card-label"
        :style="{
          background: (card.label_color ?? '#6b7280') + '20',
          color: card.label_color ?? '#6b7280',
        }"
      >
        {{ card.label }}
      </span>
      <span class="card-date">{{ formatDate(card.deadline) }}</span>
      <div class="card-assignee" />
    </div>
  </article>
</template>

<style scoped src="../styles/task-card.css"></style>
