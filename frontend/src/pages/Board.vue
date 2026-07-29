<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import draggable from 'vuedraggable'
import InboxCardsPanel from '../components/InboxCardsPanel.vue'
import TaskList from '../components/TaskList.vue'
import { ListAPI } from '../api/list'
import { CardAPI } from '../api/card'
import { InboxAPI } from '../api/inbox'
import type { DraggableChange, ListWithCards } from '../types'
import { neighborIds } from '../utils/ordering'

const route = useRoute()

const lists = ref<ListWithCards[]>([])
const loading = ref(false)
const error = ref('')
const inboxRefreshKey = ref(0)
let listLoadGeneration = 0

const showAddList = ref(false)
const newListName = ref('')
let isSubmittingList = false

async function fetchLists() {
  const generation = ++listLoadGeneration
  const workspaceId = String(route.params.workspaceId ?? '')
  lists.value = []
  loading.value = true
  error.value = ''
  try {
    const loaded = await ListAPI.listByWorkspace(workspaceId)
    if (generation === listLoadGeneration) lists.value = loaded
  } catch (e) {
    if (generation === listLoadGeneration) {
      error.value = e instanceof Error ? e.message : '보드를 불러오지 못했습니다.'
    }
  } finally {
    if (generation === listLoadGeneration) loading.value = false
  }
}

watch(() => route.params.workspaceId, fetchLists, { immediate: true })

async function submitAddList() {
  if (isSubmittingList) return
  const name = newListName.value.trim()
  showAddList.value = false
  if (!name) return
  isSubmittingList = true
  const workspaceId = route.params.workspaceId as string
  try {
    await ListAPI.create(workspaceId, name)
    await fetchLists()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '리스트를 추가하지 못했습니다.'
  } finally {
    newListName.value = ''
    isSubmittingList = false
  }
}

function cancelAddList() {
  newListName.value = ''
  showAddList.value = false
}

function onListChange(event: DraggableChange) {
  if (!event.moved) return
  const { element, newIndex } = event.moved
  const { beforeId, afterId } = neighborIds(lists.value, newIndex)
  ListAPI.reorder(element.id, {
    before_list_id: beforeId,
    after_list_id: afterId,
  }).then(fetchLists, fetchLists)
}

function onCardChange(listId: string, event: DraggableChange) {
  const list = lists.value.find((l) => l.id === listId)
  if (!list) return

  if (event.added) {
    const { element, newIndex } = event.added
    const { beforeId, afterId } = neighborIds(list.cards, newIndex)
    CardAPI.move(element.id, {
      list_id: listId,
      before_card_id: beforeId,
      after_card_id: afterId,
    }).then(fetchLists, fetchLists)
  } else if (event.moved) {
    const { element, newIndex } = event.moved
    const { beforeId, afterId } = neighborIds(list.cards, newIndex)
    CardAPI.reorder(element.id, {
      before_card_id: beforeId,
      after_card_id: afterId,
    }).then(fetchLists, fetchLists)
  }
}

async function onAddCard(listId: string, title: string) {
  try {
    await CardAPI.create(listId, { title })
    await fetchLists()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '카드를 추가하지 못했습니다.'
  }
}

async function onDeleteCard(cardId: string) {
  try {
    await InboxAPI.remove(cardId)
    const boardRefresh = fetchLists()
    inboxRefreshKey.value += 1
    await boardRefresh
  } catch (e) {
    error.value = e instanceof Error ? e.message : '카드를 삭제하지 못했습니다.'
  }
}

async function onMoveCardToInbox(cardId: string) {
  const list = lists.value.find((item) =>
    item.cards.some((card) => card.id === cardId),
  )
  if (!list) return
  try {
    await InboxAPI.moveToInbox(cardId)
    const boardRefresh = fetchLists()
    inboxRefreshKey.value += 1
    await boardRefresh
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '카드를 인박스로 옮기지 못했습니다.'
  }
}

function onInboxCardMoved() {
  void fetchLists()
}

async function onRenameList(listId: string, name: string) {
  try {
    await ListAPI.rename(listId, name)
    await fetchLists()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '리스트 이름을 변경하지 못했습니다.'
  }
}

async function onDeleteList(listId: string) {
  try {
    await InboxAPI.removeList(listId)
    const boardRefresh = fetchLists()
    inboxRefreshKey.value += 1
    await boardRefresh
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
          @move-card-to-inbox="onMoveCardToInbox"
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
            <button type="submit" class="add-list-submit-btn">추가</button>
          </form>
          <button v-else class="add-list-btn" type="button" @click="showAddList = true">
            + 리스트 추가
          </button>
        </div>
      </template>
    </draggable>
    <InboxCardsPanel
      :destination-lists="lists"
      :refresh-token="inboxRefreshKey"
      @moved="onInboxCardMoved"
    />
  </div>
</template>

<style scoped src="../styles/board.css"></style>
