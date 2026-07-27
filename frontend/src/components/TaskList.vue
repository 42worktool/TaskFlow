<script setup lang="ts">
import { ref } from 'vue'
import draggable from 'vuedraggable'
import TaskCard from './TaskCard.vue'
import type { DraggableChange, ListWithCards } from '../types'

const props = defineProps<{
  list: ListWithCards
}>()

const emit = defineEmits<{
  'card-change': [listId: string, event: DraggableChange]
  'add-card': [listId: string, title: string]
  'delete-card': [cardId: string]
  'rename-list': [listId: string, name: string]
  'delete-list': [listId: string]
}>()

const badgeColors: Record<string, string> = {
  '할 일': '#6b7280',
  '진행 중': '#2563EB',
  '검토 중': '#F59E0B',
  완료: '#10B981',
}

const showAddCard = ref(false)
const newCardTitle = ref('')

function submitAddCard() {
  const title = newCardTitle.value.trim()
  showAddCard.value = false
  if (!title) return
  emit('add-card', props.list.id, title)
  newCardTitle.value = ''
}

function cancelAddCard() {
  newCardTitle.value = ''
  showAddCard.value = false
}

const renaming = ref(false)
const renameValue = ref(props.list.name)

function submitRename() {
  if (!renaming.value) return
  const name = renameValue.value.trim()
  renaming.value = false
  if (!name || name === props.list.name) {
    renameValue.value = props.list.name
    return
  }
  emit('rename-list', props.list.id, name)
}

function cancelRename() {
  renameValue.value = props.list.name
  renaming.value = false
}

const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus(),
}
</script>

<template>
  <section class="task-list">
    <div class="list-header">
      <input
        v-if="renaming"
        v-model="renameValue"
        class="list-name-input"
        type="text"
        @keyup.enter="submitRename"
        @keyup.esc="cancelRename"
        @blur="submitRename"
        v-focus
      />
      <span v-else class="list-name" @click="renaming = true">{{ list.name }}</span>
      <div class="list-header-actions">
        <span class="list-count" :style="{ background: badgeColors[list.name] ?? '#6b7280' }">
          {{ list.cards.length }}
        </span>
        <button class="list-delete-btn" type="button" aria-label="리스트 삭제" @click="emit('delete-list', list.id)">
          ×
        </button>
      </div>
    </div>

    <draggable
      v-model="list.cards"
      item-key="id"
      group="board-cards"
      class="card-list"
      ghost-class="card-ghost"
      @change="(e: DraggableChange) => emit('card-change', list.id, e)"
    >
      <template #item="{ element: card }">
        <TaskCard :card="card" @delete="emit('delete-card', card.id)" />
      </template>
    </draggable>

    <form v-if="showAddCard" class="add-card-form" @submit.prevent="submitAddCard">
      <input
        v-model="newCardTitle"
        type="text"
        class="add-card-input"
        placeholder="카드 제목 입력"
        v-focus
        @keyup.esc="cancelAddCard"
        @blur="submitAddCard"
      />
      <button type="submit" class="add-card-submit-btn">추가</button>
    </form>
    <button v-else class="add-card-btn" type="button" @click="showAddCard = true">
      + 카드 추가
    </button>
  </section>
</template>

<style scoped src="../styles/task-list.css"></style>
