<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import CardDetailModal from '../components/CardDetailModal.vue'
import InboxCardsPanel from '../components/InboxCardsPanel.vue'
import TaskList from '../components/TaskList.vue'
import { ListAPI } from '../api/list'
import { CardAPI } from '../api/card'
import { InboxAPI } from '../api/inbox'
import { realtime } from '../services/realtime'
import { parseWorkspaceChangedEvent } from '../services/realtime/protocol'
import type { Card, DraggableChange, ListWithCards } from '../types'
import { neighborIds } from '../utils/ordering'

const route = useRoute()
const router = useRouter()
const props = withDefaults(
  defineProps<{
    canEditBoard?: boolean
    canViewCardDetails?: boolean
    workspaceSyncVersion?: number
  }>(),
  {
    canEditBoard: false,
    canViewCardDetails: false,
    workspaceSyncVersion: 0,
  },
)

const lists = ref<ListWithCards[]>([])
const loading = ref(false)
const error = ref('')
const inboxRefreshKey = ref(0)
const selectedCardId = ref<string | null>(null)
const cardDetailRefreshToken = ref(0)
let listLoadGeneration = 0
let dragDepth = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshRunning = false
let fullRefreshPending = false
let fullRefreshRetriesRemaining = 0
const MAX_FULL_REFRESH_RETRIES = 2
const pendingListIds = new Set<string>()
const pendingDeletedListIds = new Set<string>()

const showAddList = ref(false)
const newListName = ref('')
let isSubmittingList = false

async function fetchLists(
  options: { reset?: boolean } = {},
): Promise<void> {
  const reset = options.reset ?? true
  const generation = ++listLoadGeneration
  const workspaceId = String(route.params.workspaceId ?? '')
  const showLoading = reset || loading.value
  if (reset) {
    lists.value = []
    error.value = ''
  }
  if (showLoading) loading.value = true
  try {
    const loaded = await ListAPI.listByWorkspace(workspaceId)
    if (generation === listLoadGeneration) {
      if (!reset && dragDepth > 0) {
        queueFullRefresh()
      } else {
        lists.value = loaded
        error.value = ''
        if (!fullRefreshPending) fullRefreshRetriesRemaining = 0
      }
    }
  } catch (e) {
    if (generation === listLoadGeneration) {
      const message =
        e instanceof Error ? e.message : '보드를 불러오지 못했습니다.'
      if (showLoading) error.value = message
      else console.warn('[board] background refresh failed', message)
      if (!reset && fullRefreshRetriesRemaining > 0) {
        fullRefreshRetriesRemaining -= 1
        fullRefreshPending = true
        pendingListIds.clear()
      }
    }
  } finally {
    if (showLoading && generation === listLoadGeneration) loading.value = false
  }
}

async function refreshLists(listIds: readonly string[]): Promise<void> {
  const workspaceId = String(route.params.workspaceId ?? '')
  const results = await Promise.allSettled(
    [...new Set(listIds)].map((listId) => ListAPI.get(listId)),
  )
  if (workspaceId !== String(route.params.workspaceId ?? '')) return
  if (dragDepth > 0) {
    queueFullRefresh()
    return
  }

  if (results.some((result) => result.status === 'rejected')) {
    queueFullRefresh()
    return
  }

  const refreshed = results
    .filter(
      (result): result is PromiseFulfilledResult<ListWithCards> =>
        result.status === 'fulfilled' &&
        result.value.workspace_id === workspaceId,
    )
    .map((result) => result.value)
  const refreshedById = new Map(refreshed.map((list) => [list.id, list]))
  const next = lists.value
    .map((list) => refreshedById.get(list.id) ?? list)
    .filter((list) => !pendingDeletedListIds.has(list.id))
  for (const list of refreshed) {
    if (!next.some((item) => item.id === list.id)) next.push(list)
  }
  lists.value = next.sort((left, right) => left.sequence - right.sequence)
  error.value = ''
}

function scheduleInvalidationFlush(): void {
  if (
    dragDepth > 0 ||
    refreshRunning ||
    refreshTimer ||
    (!fullRefreshPending &&
      pendingListIds.size === 0 &&
      pendingDeletedListIds.size === 0)
  ) {
    return
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void flushInvalidations()
  }, 80)
}

async function flushInvalidations(): Promise<void> {
  if (dragDepth > 0 || refreshRunning) return
  refreshRunning = true

  const deletedIds = new Set(pendingDeletedListIds)
  pendingDeletedListIds.clear()
  lists.value = lists.value.filter((list) => !deletedIds.has(list.id))

  const refreshAll = fullRefreshPending
  fullRefreshPending = false
  const listIds = [...pendingListIds].filter((id) => !deletedIds.has(id))
  pendingListIds.clear()

  try {
    if (refreshAll) await fetchLists({ reset: false })
    else if (listIds.length > 0) await refreshLists(listIds)
  } finally {
    refreshRunning = false
    scheduleInvalidationFlush()
  }
}

function queueFullRefresh(): void {
  fullRefreshPending = true
  fullRefreshRetriesRemaining = MAX_FULL_REFRESH_RETRIES
  pendingListIds.clear()
  scheduleInvalidationFlush()
}

function setDragging(active: boolean): void {
  dragDepth = Math.max(0, dragDepth + (active ? 1 : -1))
  if (dragDepth === 0) scheduleInvalidationFlush()
}

watch(
  () => route.params.workspaceId,
  () => {
    selectedCardId.value = null
    fullRefreshPending = false
    fullRefreshRetriesRemaining = 0
    pendingListIds.clear()
    pendingDeletedListIds.clear()
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    dragDepth = 0
    void fetchLists({ reset: true })
  },
  { immediate: true },
)

watch(
  () => props.workspaceSyncVersion,
  (next, previous) => {
    if (next !== previous) queueFullRefresh()
  },
)

watch(
  [
    () => route.params.workspaceId,
    () => route.query.card,
    () => props.canViewCardDetails,
    () => lists.value,
  ],
  ([, cardId, canViewCardDetails]) => {
    const requestedCardId = typeof cardId === 'string' ? cardId : null
    const belongsToBoard =
      requestedCardId !== null &&
      lists.value.some((list) =>
        list.cards.some((card) => card.id === requestedCardId),
      )
    selectedCardId.value =
      canViewCardDetails && belongsToBoard ? requestedCardId : null
  },
  { immediate: true },
)

async function submitAddList() {
  if (!props.canEditBoard || isSubmittingList) return
  const name = newListName.value.trim()
  showAddList.value = false
  if (!name) return
  isSubmittingList = true
  const workspaceId = route.params.workspaceId as string
  try {
    await ListAPI.create(workspaceId, name)
    queueFullRefresh()
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
  if (!props.canEditBoard || !event.moved) return
  const { element, newIndex } = event.moved
  const { beforeId, afterId } = neighborIds(lists.value, newIndex)
  ListAPI.reorder(element.id, {
    before_list_id: beforeId,
    after_list_id: afterId,
  }).then(
    () => queueFullRefresh(),
    () => queueFullRefresh(),
  )
}

function onCardChange(listId: string, event: DraggableChange) {
  if (!props.canEditBoard) return
  const list = lists.value.find((l) => l.id === listId)
  if (!list) return

  if (event.added) {
    const { element, newIndex } = event.added
    const { beforeId, afterId } = neighborIds(list.cards, newIndex)
    CardAPI.move(element.id, {
      list_id: listId,
      before_card_id: beforeId,
      after_card_id: afterId,
    }).then(
      () => queueFullRefresh(),
      () => queueFullRefresh(),
    )
  } else if (event.moved) {
    const { element, newIndex } = event.moved
    const { beforeId, afterId } = neighborIds(list.cards, newIndex)
    CardAPI.reorder(element.id, {
      before_card_id: beforeId,
      after_card_id: afterId,
    }).then(
      () => queueFullRefresh(),
      () => queueFullRefresh(),
    )
  }
}

async function onAddCard(listId: string, title: string) {
  if (!props.canEditBoard) return
  try {
    await CardAPI.create(listId, { title })
    queueFullRefresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '카드를 추가하지 못했습니다.'
  }
}

async function onDeleteCard(cardId: string) {
  if (!props.canEditBoard) return
  try {
    await InboxAPI.remove(cardId)
    queueFullRefresh()
    inboxRefreshKey.value += 1
  } catch (e) {
    error.value = e instanceof Error ? e.message : '카드를 삭제하지 못했습니다.'
  }
}

async function onMoveCardToInbox(cardId: string) {
  if (!props.canEditBoard) return
  const list = lists.value.find((item) =>
    item.cards.some((card) => card.id === cardId),
  )
  if (!list) return
  try {
    await InboxAPI.moveToInbox(cardId)
    queueFullRefresh()
    inboxRefreshKey.value += 1
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '카드를 인박스로 옮기지 못했습니다.'
  }
}

function onInboxCardMoved() {
  queueFullRefresh()
}

function openCard(card: Card) {
  if (!props.canViewCardDetails) return
  selectedCardId.value = card.id
  void router.replace({
    query: {
      ...route.query,
      card: card.id,
    },
  })
}

function closeCard() {
  selectedCardId.value = null
  if (typeof route.query.card !== 'string') return
  const query = { ...route.query }
  delete query.card
  void router.replace({ query })
}

function onCardSaved(saved: Card) {
  lists.value = lists.value.map((list) => ({
    ...list,
    cards: list.cards.map((card) => (card.id === saved.id ? saved : card)),
  }))
}

async function onRenameList(listId: string, name: string) {
  if (!props.canEditBoard) return
  try {
    await ListAPI.rename(listId, name)
    queueFullRefresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '리스트 이름을 변경하지 못했습니다.'
  }
}

async function onDeleteList(listId: string) {
  if (!props.canEditBoard) return
  try {
    await InboxAPI.removeList(listId)
    queueFullRefresh()
    inboxRefreshKey.value += 1
  } catch (e) {
    error.value = e instanceof Error ? e.message : '리스트를 삭제하지 못했습니다.'
  }
}

const removeWorkspaceChangeListener = realtime.on(
  'workspace.changed',
  (value) => {
    const event = parseWorkspaceChangedEvent(value)
    const currentWorkspaceId = String(route.params.workspaceId ?? '')
    if (!event || event.workspace_id !== currentWorkspaceId) return

    if (loading.value) {
      if (
        event.entity === 'card' &&
        selectedCardId.value === event.entity_id
      ) {
        cardDetailRefreshToken.value += 1
      }
      queueFullRefresh()
      return
    }

    if (event.entity === 'list') {
      if (event.action === 'deleted') {
        const deletedList = lists.value.find(
          (list) => list.id === event.entity_id,
        )
        if (
          selectedCardId.value &&
          deletedList?.cards.some(
            (card) => card.id === selectedCardId.value,
          )
        ) {
          closeCard()
        }
        pendingDeletedListIds.add(event.entity_id)
        pendingListIds.delete(event.entity_id)
      } else {
        const ids =
          event.list_ids.length > 0
            ? event.list_ids
            : [event.entity_id]
        ids.forEach((id) => pendingListIds.add(id))
      }
      scheduleInvalidationFlush()
      return
    }

    if (event.entity !== 'card') return
    if (
      event.action === 'deleted' &&
      selectedCardId.value === event.entity_id
    ) {
      closeCard()
    } else if (selectedCardId.value === event.entity_id) {
      cardDetailRefreshToken.value += 1
    }
    event.list_ids.forEach((id) => pendingListIds.add(id))
    scheduleInvalidationFlush()
  },
)

onUnmounted(() => {
  listLoadGeneration += 1
  removeWorkspaceChangeListener()
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<template>
  <div class="board-page">
    <div v-if="loading" class="board-status">불러오는 중...</div>
    <div v-else-if="error" class="board-status board-status--error">{{ error }}</div>
    <draggable
      v-else
      v-model="lists"
      item-key="id"
      :disabled="!canEditBoard"
      handle=".list-header"
      class="board-columns"
      @start="setDragging(true)"
      @end="setDragging(false)"
      @change="onListChange"
    >
      <template #item="{ element: col }">
        <TaskList
          :list="col"
          :can-edit="canEditBoard"
          :can-open-details="canViewCardDetails"
          @open-card="openCard"
          @card-change="onCardChange"
          @drag-state="setDragging"
          @add-card="onAddCard"
          @delete-card="onDeleteCard"
          @move-card-to-inbox="onMoveCardToInbox"
          @rename-list="onRenameList"
          @delete-list="onDeleteList"
        />
      </template>
      <template #footer>
        <div v-if="canEditBoard" class="add-list-column">
          <form v-if="showAddList" class="add-list-form" @submit.prevent="submitAddList">
            <input
              v-model="newListName"
              type="text"
              class="add-list-input"
              placeholder="리스트 이름 입력"
              required
              autofocus
              @keyup.esc="cancelAddList"
              @blur="submitAddList"
            />
            <button
              type="submit"
              class="add-list-submit-btn"
              :disabled="!newListName.trim()"
            >
              추가
            </button>
          </form>
          <button v-else class="add-list-btn" type="button" @click="showAddList = true">
            + 리스트 추가
          </button>
        </div>
      </template>
    </draggable>
    <InboxCardsPanel
      :destination-lists="canEditBoard ? lists : []"
      :refresh-token="inboxRefreshKey"
      @moved="onInboxCardMoved"
    />
    <CardDetailModal
      v-if="selectedCardId"
      :card-id="selectedCardId"
      :editable="canEditBoard"
      :refresh-token="cardDetailRefreshToken"
      @saved="onCardSaved"
      @close="closeCard"
    />
  </div>
</template>

<style scoped src="../styles/board.css"></style>
