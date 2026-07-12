<script setup lang="ts">
import TaskCard from './TaskCard.vue'
import type { Card, List } from '../types'

defineProps<{
  list: List
  cards: Card[]
}>()

const badgeColors: Record<string, string> = {
  '할 일': '#6b7280',
  '진행 중': '#2563EB',
  '검토 중': '#F59E0B',
  완료: '#10B981',
}
</script>

<template>
  <section class="task-list">
    <div class="list-header">
      <span class="list-name">{{ list.name }}</span>
      <span class="list-count" :style="{ background: badgeColors[list.name] ?? '#6b7280' }">
        {{ cards.length }}
      </span>
    </div>

    <ul class="card-list">
      <li v-for="card in cards" :key="card.id">
        <TaskCard :card="card" />
      </li>
    </ul>

    <button class="add-card-btn" type="button">+ 카드 추가</button>
  </section>
</template>

<style scoped src="../styles/task-list.css"></style>
