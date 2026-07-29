<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CardDetailModal from '../components/CardDetailModal.vue'
import { ListAPI } from '../api/list'
import { realtime } from '../services/realtime'
import { parseWorkspaceChangedEvent } from '../services/realtime/protocol'
import type { Card, ListWithCards } from '../types'
import { cardOccursOnDate } from '../utils/calendar'

const route = useRoute()
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
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const lists = ref<ListWithCards[]>([])
const cards = computed(() => lists.value.flatMap((list) => list.cards))
const loading = ref(false)
const error = ref('')
const selectedCardId = ref<string | null>(null)
const cardDetailRefreshToken = ref(0)
let loadGeneration = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshRunning = false
let fullRefreshPending = false
let fullRefreshRetriesRemaining = 0
const MAX_FULL_REFRESH_RETRIES = 2
const pendingListIds = new Set<string>()
const pendingDeletedListIds = new Set<string>()

const todayDate = now.getDate()
const todayMonth = now.getMonth() + 1
const todayYear = now.getFullYear()

const monthLabel = computed(() => `${year.value}년 ${month.value}월`)

function prevMonth() {
  if (month.value === 1) {
    month.value = 12
    year.value--
  } else month.value--
}

function nextMonth() {
  if (month.value === 12) {
    month.value = 1
    year.value++
  } else month.value++
}

function isToday(date: number | null): boolean {
  return date === todayDate && month.value === todayMonth && year.value === todayYear
}

function updateSavedCard(saved: Card): void {
  lists.value = lists.value.map((list) => ({
    ...list,
    cards: list.cards.map((card) =>
      card.id === saved.id ? saved : card,
    ),
  }))
}

function openCard(cardId: string): void {
  if (props.canViewCardDetails) selectedCardId.value = cardId
}

interface CalendarCell {
  date: number | null
  cards: Card[]
}

const calendarDays = computed<CalendarCell[]>(() => {
  const firstDay = new Date(year.value, month.value - 1, 1).getDay()
  const daysInMonth = new Date(year.value, month.value, 0).getDate()
  const days: CalendarCell[] = []

  for (let i = 0; i < firstDay; i++) {
    days.push({ date: null, cards: [] })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year.value, month.value - 1, d)
    days.push({
      date: d,
      cards: cards.value.filter((card) => cardOccursOnDate(card, date)),
    })
  }
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 0; i < remaining; i++) {
      days.push({ date: null, cards: [] })
    }
  }
  return days
})

const hasCardsThisMonth = computed(() =>
  calendarDays.value.some((cell) => cell.cards.length > 0),
)

async function loadLists(reset: boolean): Promise<void> {
  const generation = ++loadGeneration
  const workspaceId = String(route.params.workspaceId ?? '')
  const showLoading = reset || loading.value
  if (reset) {
    lists.value = []
    error.value = ''
  }
  if (showLoading) loading.value = true

  try {
    const loaded = await ListAPI.listByWorkspace(workspaceId)
    if (
      generation === loadGeneration &&
      workspaceId === String(route.params.workspaceId ?? '')
    ) {
      lists.value = loaded
      error.value = ''
      if (!fullRefreshPending) fullRefreshRetriesRemaining = 0
    }
  } catch (caught) {
    if (generation !== loadGeneration) return
    const message =
      caught instanceof Error
        ? caught.message
        : '달력 일정을 불러오지 못했습니다.'
    if (showLoading) error.value = message
    else console.warn('[calendar] background refresh failed', message)
    if (!reset && fullRefreshRetriesRemaining > 0) {
      fullRefreshRetriesRemaining -= 1
      fullRefreshPending = true
      pendingListIds.clear()
    }
  } finally {
    if (showLoading && generation === loadGeneration) loading.value = false
  }
}

async function refreshLists(listIds: readonly string[]): Promise<void> {
  const workspaceId = String(route.params.workspaceId ?? '')
  const results = await Promise.allSettled(
    [...new Set(listIds)].map((listId) => ListAPI.get(listId)),
  )
  if (workspaceId !== String(route.params.workspaceId ?? '')) return
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
  const next = lists.value.map(
    (list) => refreshedById.get(list.id) ?? list,
  )
  for (const list of refreshed) {
    if (!next.some((item) => item.id === list.id)) next.push(list)
  }
  lists.value = next.sort((left, right) => left.sequence - right.sequence)
  error.value = ''
}

function scheduleInvalidationFlush(): void {
  if (
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

function queueFullRefresh(): void {
  fullRefreshPending = true
  fullRefreshRetriesRemaining = MAX_FULL_REFRESH_RETRIES
  pendingListIds.clear()
  scheduleInvalidationFlush()
}

async function flushInvalidations(): Promise<void> {
  if (refreshRunning) return
  refreshRunning = true

  const deletedIds = new Set(pendingDeletedListIds)
  pendingDeletedListIds.clear()
  lists.value = lists.value.filter((list) => !deletedIds.has(list.id))

  const refreshAll = fullRefreshPending
  fullRefreshPending = false
  const listIds = [...pendingListIds].filter((id) => !deletedIds.has(id))
  pendingListIds.clear()

  try {
    if (refreshAll) await loadLists(false)
    else if (listIds.length > 0) await refreshLists(listIds)
  } finally {
    refreshRunning = false
    scheduleInvalidationFlush()
  }
}

watch(
  () => String(route.params.workspaceId ?? ''),
  (workspaceId) => {
    loadGeneration += 1
    lists.value = []
    selectedCardId.value = null
    error.value = ''
    loading.value = false
    fullRefreshPending = false
    fullRefreshRetriesRemaining = 0
    pendingListIds.clear()
    pendingDeletedListIds.clear()
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    if (!workspaceId) return
    void loadLists(true)
  },
  { immediate: true },
)

watch(
  () => props.workspaceSyncVersion,
  (next, previous) => {
    if (next === previous) return
    queueFullRefresh()
  },
)

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
      fullRefreshPending = true
      pendingListIds.clear()
      scheduleInvalidationFlush()
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
          selectedCardId.value = null
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
      selectedCardId.value = null
    } else if (selectedCardId.value === event.entity_id) {
      cardDetailRefreshToken.value += 1
    }
    event.list_ids.forEach((id) => pendingListIds.add(id))
    scheduleInvalidationFlush()
  },
)

onUnmounted(() => {
  loadGeneration += 1
  removeWorkspaceChangeListener()
  if (refreshTimer) clearTimeout(refreshTimer)
})

const weekDays = ['일', '월', '화', '수', '목', '금', '토']
</script>

<template>
  <div class="calendar-page">
    <div class="cal-header">
      <button type="button" class="nav-arrow" aria-label="이전 달" @click="prevMonth">
        &lt;
      </button>
      <h2 class="month-label">{{ monthLabel }}</h2>
      <button type="button" class="nav-arrow" aria-label="다음 달" @click="nextMonth">
        &gt;
      </button>
    </div>

    <p v-if="loading" class="cal-status" role="status">일정을 불러오는 중…</p>
    <p v-else-if="error" class="cal-status cal-status--error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="!hasCardsThisMonth" class="cal-empty">
      이 달에 일정이 있는 카드가 없습니다.
    </p>

    <div v-if="!loading && !error" class="cal-grid">
      <div
        v-for="day in weekDays"
        :key="day"
        class="weekday-header"
        :class="{ 'weekday-sun': day === '일' }"
      >
        {{ day }}
      </div>

      <div
        v-for="(cell, i) in calendarDays"
        :key="i"
        class="cal-cell"
        :class="{ 'cal-cell--today': isToday(cell.date) }"
      >
        <span
          v-if="cell.date"
          class="cell-date"
          :class="{ 'cell-date--today': isToday(cell.date) }"
        >
          {{ cell.date }}
        </span>
        <button
          v-for="c in cell.cards"
          :key="c.id"
          type="button"
          class="cal-card"
          :disabled="!canViewCardDetails"
          @click="openCard(c.id)"
        >
          {{ c.title }}
        </button>
      </div>
    </div>
    <CardDetailModal
      v-if="selectedCardId"
      :card-id="selectedCardId"
      :editable="canEditBoard"
      :refresh-token="cardDetailRefreshToken"
      @saved="updateSavedCard"
      @close="selectedCardId = null"
    />
  </div>
</template>

<style scoped src="../styles/calendar.css"></style>
