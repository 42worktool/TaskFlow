<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CardDetailModal from '../components/CardDetailModal.vue'
import { ListAPI } from '../api/list'
import type { Card } from '../types'
import { cardOccursOnDate } from '../utils/calendar'

const route = useRoute()
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const cards = ref<Card[]>([])
const loading = ref(false)
const error = ref('')
const selectedCardId = ref<string | null>(null)

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
  cards.value = cards.value.map((card) =>
    card.id === saved.id ? saved : card,
  )
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

watch(
  () => String(route.params.workspaceId ?? ''),
  async (workspaceId, _previousWorkspaceId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    cards.value = []
    selectedCardId.value = null
    error.value = ''
    if (!workspaceId) return

    loading.value = true
    try {
      const lists = await ListAPI.listByWorkspace(workspaceId)
      if (!cancelled) cards.value = lists.flatMap((list) => list.cards)
    } catch (caught) {
      if (!cancelled) {
        error.value =
          caught instanceof Error ? caught.message : '달력 일정을 불러오지 못했습니다.'
      }
    } finally {
      if (!cancelled) loading.value = false
    }
  },
  { immediate: true },
)

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
          @click="selectedCardId = c.id"
        >
          {{ c.title }}
        </button>
      </div>
    </div>
    <CardDetailModal
      v-if="selectedCardId"
      :card-id="selectedCardId"
      @saved="updateSavedCard"
      @close="selectedCardId = null"
    />
  </div>
</template>

<style scoped src="../styles/calendar.css"></style>
