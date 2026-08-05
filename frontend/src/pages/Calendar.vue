<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useRoute } from 'vue-router'
import CardDetailModal from '../components/CardDetailModal.vue'
import { ListAPI } from '../api/list'
import { realtime } from '../services/realtime'
import { parseWorkspaceChangedEvent } from '../services/realtime/protocol'
import type { Card, ListWithCards, WorkspaceMember } from '../types'
import {
  buildCalendarWeeks,
  type CalendarRangeSegment,
} from '../utils/calendar'
import { workspaceMemberNameFor } from '../utils/workspacePermissions'

const route = useRoute()
const props = withDefaults(
  defineProps<{
    canEditBoard?: boolean
    canViewCardDetails?: boolean
    canManageComments?: boolean
    workspaceMembers?: WorkspaceMember[]
    workspaceSyncVersion?: number
  }>(),
  {
    canEditBoard: false,
    canViewCardDetails: false,
    canManageComments: false,
    workspaceMembers: () => [],
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
const cardDetailChangeActorName = ref<string | null>(null)
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
  if (!props.canViewCardDetails) return
  cardDetailChangeActorName.value = null
  selectedCardId.value = cardId
}

function rememberCardChangeActor(userId: string): void {
  cardDetailChangeActorName.value = workspaceMemberNameFor(
    props.workspaceMembers,
    userId,
  )
}

const calendarWeeks = computed(() =>
  buildCalendarWeeks(year.value, month.value, cards.value),
)

const hasCardsThisMonth = computed(() =>
  calendarWeeks.value.some((week) => week.segments.length > 0),
)

const rangeColors = ['#2563eb', '#7c3aed', '#0f766e', '#c2410c', '#be123c']

function rangeColor(cardId: string): string {
  let hash = 0
  for (let index = 0; index < cardId.length; index++) {
    hash = (hash * 31 + cardId.charCodeAt(index)) | 0
  }
  return rangeColors[Math.abs(hash) % rangeColors.length]
}

function weekStyle(laneCount: number): CSSProperties {
  return {
    '--cal-lane-count': String(Math.max(1, laneCount)),
  }
}

function segmentStyle(segment: CalendarRangeSegment): CSSProperties {
  return {
    gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`,
    gridRow: String(segment.lane + 1),
    '--cal-range-color': rangeColor(segment.card.id),
  }
}

function formatCardDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

function cardRangeLabel(card: Card): string {
  const start = formatCardDate(card.start_at)
  const deadline = formatCardDate(card.deadline)
  const period =
    start && deadline
      ? `${start}부터 ${deadline}까지`
      : start || deadline
  return period ? `${card.title}, ${period}` : card.title
}

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
        rememberCardChangeActor(event.actor_user_id)
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
      rememberCardChangeActor(event.actor_user_id)
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
      <div class="cal-weekdays">
        <div
          v-for="day in weekDays"
          :key="day"
          class="weekday-header"
          :class="{ 'weekday-sun': day === '일' }"
        >
          {{ day }}
        </div>
      </div>

      <div
        v-for="(week, weekIndex) in calendarWeeks"
        :key="weekIndex"
        class="cal-week"
        :style="weekStyle(week.laneCount)"
      >
        <div class="cal-week-days">
          <div
            v-for="(day, dayIndex) in week.days"
            :key="dayIndex"
            class="cal-cell"
            :class="{ 'cal-cell--today': isToday(day.date) }"
          >
            <span
              v-if="day.date"
              class="cell-date"
              :class="{ 'cell-date--today': isToday(day.date) }"
            >
              {{ day.date }}
            </span>
          </div>
        </div>

        <div class="cal-week-ranges">
          <button
            v-for="segment in week.segments"
            :key="segment.card.id"
            type="button"
            class="cal-range"
            :class="{
              'cal-range--continues-before': segment.continuesBefore,
              'cal-range--continues-after': segment.continuesAfter,
            }"
            :style="segmentStyle(segment)"
            :title="cardRangeLabel(segment.card)"
            :aria-label="cardRangeLabel(segment.card)"
            :disabled="!canViewCardDetails"
            @click="openCard(segment.card.id)"
          >
            <span class="cal-range-label">{{ segment.card.title }}</span>
          </button>
        </div>
      </div>
    </div>
    <CardDetailModal
      v-if="selectedCardId"
      :card-id="selectedCardId"
      :editable="canEditBoard"
      :can-manage-comments="canManageComments"
      :last-change-actor-name="cardDetailChangeActorName"
      :refresh-token="cardDetailRefreshToken"
      @saved="updateSavedCard"
      @close="selectedCardId = null"
    />
  </div>
</template>

<style scoped src="../styles/calendar.css"></style>
