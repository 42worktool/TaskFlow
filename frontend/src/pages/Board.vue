<script setup lang="ts">
import { computed } from 'vue'
import InboxCardsPanel from '../components/InboxCardsPanel.vue'
import TaskList from '../components/TaskList.vue'
import { lists, cards } from '../mock/data'

const columns = computed(() =>
  lists.map((list) => ({
    ...list,
    cards: cards.filter((c) => c.list_id === list.id),
  })),
)
</script>

<template>
  <div class="board-page">
    <div class="board-columns">
      <TaskList v-for="col in columns" :key="col.id" :list="col" :cards="col.cards" />
    </div>
    <InboxCardsPanel />
  </div>
</template>

<style scoped src="../styles/board.css"></style>
