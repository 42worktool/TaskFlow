<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import draggable from 'vuedraggable'
import InboxCardsPanel from '../components/InboxCardsPanel.vue'
import TaskList from '../components/TaskList.vue'
import { ListAPI } from '../api/list'
import { CardAPI } from '../api/card'
import type { DraggableChange, ListWithCards } from '../types'

const route = useRoute()

const lists = ref<ListWithCards[]>([])
const loading = ref(false)
const error = ref('')

const showAddList = ref(false)
const newListName = ref('')

async function fetchLists() {
  const workspaceId = route.params.workspaceId as string
  loading.value = true
  error.value = ''
  try {
    lists.value = await ListAPI.listByWorkspace(workspaceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '보드를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

watch(() => route.params.workspaceId, fetchLists, { immediate: true })

async function submitAddList() {
  const name = newListName.value.trim()
  showAddList.value = false
  if (!name) return
  const workspaceId = route.params.workspaceId as string
  try {
    const created = await ListAPI.create(workspaceId, name)
    lists.value.push({ ...created, cards: [] })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '리스트를 추가하지 못했습니다.'
  }
  newListName.value = ''
}

function cancelAddList() {
  newListName.value = ''
  showAddList.value = false
}

function onListChange(event: DraggableChange) {
  if (!event.moved) return
  const { element, newIndex } = event.moved
  const before = lists.value[newIndex - 1]?.id ?? null
  const after = lists.value[newIndex + 1]?.id ?? null
  ListAPI.reorder(element.id, { before_list_id: before, after_list_id: after }).catch(fetchLists)
}

function onCardChange(listId: string, event: DraggableChange) {
  const list = lists.value.find((l) => l.id === listId)
  if (!list) return

  if (event.added) {
    const { element, newIndex } = event.added
    const before = list.cards[newIndex - 1]?.id ?? null
    const after = list.cards[newIndex + 1]?.id ?? null
    CardAPI.move(element.id, { list_id: listId, before_card_id: before, after_card_id: after }).catch(fetchLists)
  } else if (event.moved) {
    const { element, newIndex } = event.moved
    const before = list.cards[newIndex - 1]?.id ?? null
    const after = list.cards[newIndex + 1]?.id ?? null
    CardAPI.reorder(element.id, { before_card_id: before, after_card_id: after }).catch(fetchLists)
  }
}

async function onAddCard(listId: string, title: string) {
  const list = lists.value.find((l) => l.id === listId)
  if (!list) return
  try {
    const created = await CardAPI.create(listId, { title })
    list.cards.push(created)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '카드를 추가하지 못했습니다.'
  }
}

async function onDeleteCard(cardId: string) {
  const list = lists.value.find((l) => l.cards.some((c) => c.id === cardId))
  if (!list) return
  try {
    await CardAPI.remove(cardId)
    list.cards = list.cards.filter((c) => c.id !== cardId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '카드를 삭제하지 못했습니다.'
  }
}

async function onRenameList(listId: string, name: string) {
  const list = lists.value.find((l) => l.id === listId)
  if (!list) return
  const previous = list.name
  list.name = name
  try {
    await ListAPI.rename(listId, name)
  } catch (e) {
    list.name = previous
    error.value = e instanceof Error ? e.message : '리스트 이름을 변경하지 못했습니다.'
  }
}

async function onDeleteList(listId: string) {
  try {
    await ListAPI.remove(listId)
    lists.value = lists.value.filter((l) => l.id !== listId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '리스트를 삭제하지 못했습니다.'
  }
}
</script>

<template>
  <div class="board-page">
    <div v-if="loading" class="board-status">불러오는 중...</div>
    <div v-else-if="error" class="board-status board-status--error">{{ error }}</div>
    <draggable
      v-else
      v-model="lists"
      item-key="id"
      handle=".list-header"
      class="board-columns"
      @change="onListChange"
    >
      <template #item="{ element: col }">
        <TaskList
          :list="col"
          @card-change="onCardChange"
          @add-card="onAddCard"
          @delete-card="onDeleteCard"
          @rename-list="onRenameList"
          @delete-list="onDeleteList"
        />
      </template>
      <template #footer>
        <div class="add-list-column">
          <form v-if="showAddList" class="add-list-form" @submit.prevent="submitAddList">
            <input
              v-model="newListName"
              type="text"
              class="add-list-input"
              placeholder="리스트 이름 입력"
              autofocus
              @keyup.esc="cancelAddList"
              @blur="submitAddList"
            />
          </form>
          <button v-else class="add-list-btn" type="button" @click="showAddList = true">
            + 리스트 추가
          </button>
        </div>
      </template>
    </draggable>
    <InboxCardsPanel />
  </div>
</template>

<style scoped src="../styles/board.css"></style>
