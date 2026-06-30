<script setup lang="ts">
import TaskCard from './TaskCard.vue'
import { cards } from '../mock/data'

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)
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
      <button class="panel-action" type="button">+ 카드 추가</button>
    </div>

    <ul class="inbox-card-list">
      <li v-for="card in cards" :key="card.id">
        <TaskCard :card="card" />
      </li>
    </ul>
  </section>
</template>

<style scoped src="../styles/inbox-cards-panel.css"></style>
