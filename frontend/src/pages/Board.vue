<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
import {
  clearChatCardDrop,
  clearInboxDestinations,
  consumeChatCardDrop,
  finishCardDrag,
  messengerState,
  notifyBoardChanged,
  notifyInboxChanged,
  setInboxDestinations,
  startCardDrag,
} from '../services/messenger'
import type { Card, DraggableChange, ListWithCards } from '../types'
import { horizontalEdgeScrollDelta } from '../utils/dragAutoScroll'
import { neighborIds } from '../utils/ordering'

const route = useRoute()
const router = useRouter()
const props = withDefaults(
  defineProps<{
    canEditBoard?: boolean
    canViewCardDetails?: boolean
    inboxOpen?: boolean
    workspaceSyncVersion?: number
  }>(),
  {
    canEditBoard: false,
    canViewCardDetails: false,
    inboxOpen: false,
    workspaceSyncVersion: 0,
  },
)

const lists = ref<ListWithCards[]>([])
const loading = ref(false)
const error = ref('')
const selectedCardId = ref<string | null>(null)
const cardDetailRefreshToken = ref(0)
const boardColumns = ref<{ $el: HTMLElement } | null>(null)
let listLoadGeneration = 0
let dragDepth = 0
let dragPointerX: number | null = null
let autoScrollFrame: number | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshRunning = false
let fullRefreshPending = false
let fullRefreshRetriesRemaining = 0
const MAX_FULL_REFRESH_RETRIES = 2
const pendingListIds = new Set<string>()
const pendingDeletedListIds = new Set<string>()
const inboxAcceptingBoardCard = computed(
  () =>
    props.inboxOpen &&
    props.canEditBoard &&
    messengerState.cardDrag?.source === 'board',
)

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

function stopBoardAutoScroll(): void {
  dragPointerX = null
  if (autoScrollFrame !== null) {
    window.cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = null
  }
}

function continueBoardAutoScroll(): void {
  autoScrollFrame = null
  const element = boardColumns.value?.$el
  if (
    !element ||
    dragPointerX === null ||
    messengerState.cardDrag?.source !== 'inbox'
  ) {
    return
  }

  const bounds = element.getBoundingClientRect()
  const delta = horizontalEdgeScrollDelta({
    pointerX: dragPointerX,
    left: bounds.left,
    right: bounds.right,
    scrollLeft: element.scrollLeft,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  })
  if (delta === 0) return

  element.scrollLeft += delta
  autoScrollFrame = window.requestAnimationFrame(continueBoardAutoScroll)
}

function handleCardDragPointer(event: { clientX: number }): void {
  if (messengerState.cardDrag?.source !== 'inbox') return
  dragPointerX = event.clientX
  if (autoScrollFrame === null) {
    autoScrollFrame = window.requestAnimationFrame(continueBoardAutoScroll)
  }
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
    () => props.canEditBoard,
    () => lists.value.map((list) => ({ id: list.id, name: list.name })),
  ],
  ([canEditBoard, destinations]) => {
    setInboxDestinations(canEditBoard ? destinations : [])
  },
  { immediate: true },
)

watch(
  () => messengerState.boardRefreshToken,
  (next, previous) => {
    if (next !== previous) queueFullRefresh()
  },
)

watch(
  () => messengerState.cardDrag !== null,
  (active, previous) => {
    if (active !== previous) setDragging(active)
    if (!active) stopBoardAutoScroll()
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

function onListChange(event: DraggableChange<ListWithCards>) {
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

function onCardChange(listId: string, event: DraggableChange<Card>) {
  if (!props.canEditBoard) return
  const list = lists.value.find((l) => l.id === listId)
  if (!list) return

  if (event.added) {
    const { element, newIndex } = event.added
    if (consumeChatCardDrop(element.id)) {
      queueFullRefresh()
      return
    }
    const { beforeId, afterId } = neighborIds(list.cards, newIndex)
    const movedFromInbox = element.list_id === null
    const request = movedFromInbox
      ? InboxAPI.moveToList(element.id, listId, {
          before_card_id: beforeId,
          after_card_id: afterId,
        })
      : CardAPI.move(element.id, {
          list_id: listId,
          before_card_id: beforeId,
          after_card_id: afterId,
        })
    request.then(
      () => {
        queueFullRefresh()
        if (movedFromInbox) notifyInboxChanged()
      },
      () => {
        queueFullRefresh()
        if (movedFromInbox) notifyInboxChanged()
      },
    )
  } else if (event.moved) {
    const { element, newIndex } = event.moved
    if (consumeChatCardDrop(element.id)) {
      queueFullRefresh()
      return
    }
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
    notifyInboxChanged()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '카드를 삭제하지 못했습니다.'
  }
}

function onBoardCardDragStart(card: Card): void {
  if (!props.canEditBoard) return
  startCardDrag(card.id, 'board')
}

function onBoardCardDragEnd(): void {
  const cardId =
    messengerState.cardDrag?.source === 'board'
      ? messengerState.cardDrag.cardId
      : null
  finishCardDrag()
  if (!cardId) return
  window.setTimeout(() => {
    if (messengerState.cardDrag?.cardId === cardId) return
    clearChatCardDrop(cardId)
  }, 0)
}

function onInboxCardDragStart(card: Card): void {
  if (!props.canEditBoard || !props.inboxOpen) return
  startCardDrag(card.id, 'inbox')
}

function onInboxCardDragEnd(): void {
  finishCardDrag()
}

function onInboxDropSettled(): void {
  notifyBoardChanged()
  notifyInboxChanged()
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
    notifyInboxChanged()
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

onMounted(() => {
  window.addEventListener('dragover', handleCardDragPointer)
  window.addEventListener('mousemove', handleCardDragPointer)
  window.addEventListener('pointermove', handleCardDragPointer)
})

onUnmounted(() => {
  listLoadGeneration += 1
  clearInboxDestinations()
  if (messengerState.cardDrag) finishCardDrag()
  clearChatCardDrop()
  removeWorkspaceChangeListener()
  stopBoardAutoScroll()
  window.removeEventListener('dragover', handleCardDragPointer)
  window.removeEventListener('mousemove', handleCardDragPointer)
  window.removeEventListener('pointermove', handleCardDragPointer)
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<template>
  <div class="board-page">
    <div v-if="loading && !inboxOpen" class="board-status">불러오는 중...</div>
    <div
      v-else-if="error && !inboxOpen"
      class="board-status board-status--error"
    >
      {{ error }}
    </div>
    <draggable
      v-else
      ref="boardColumns"
      v-model="lists"
      item-key="id"
      :disabled="!canEditBoard || loading || Boolean(error)"
      handle=".list-header"
      class="board-columns"
      :class="{ 'board-columns--inbox-open': inboxOpen }"
      @start="setDragging(true)"
      @end="setDragging(false)"
      @change="onListChange"
    >
      <template #header>
        <div
          v-if="inboxOpen"
          id="workspace-inbox-panel"
          class="board-inbox-column"
        >
          <InboxCardsPanel
            board-column
            :destination-lists="messengerState.inboxDestinations"
            :refresh-token="messengerState.inboxRefreshToken"
            :accepting-drop="inboxAcceptingBoardCard"
            @drop-settled="onInboxDropSettled"
            @drag-start="onInboxCardDragStart"
            @drag-end="onInboxCardDragEnd"
          />
        </div>
      </template>
      <template #item="{ element: col }">
        <TaskList
          :list="col"
          :can-edit="canEditBoard"
          :can-open-details="canViewCardDetails"
          @open-card="openCard"
          @card-change="onCardChange"
          @card-drag-start="onBoardCardDragStart"
          @card-drag-end="onBoardCardDragEnd"
          @add-card="onAddCard"
          @delete-card="onDeleteCard"
          @rename-list="onRenameList"
          @delete-list="onDeleteList"
        />
      </template>
      <template #footer>
        <div v-if="loading" class="board-inline-status">
          보드를 불러오는 중…
        </div>
        <div v-else-if="error" class="board-inline-status board-status--error">
          {{ error }}
        </div>
        <div v-else-if="canEditBoard" class="add-list-column">
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
