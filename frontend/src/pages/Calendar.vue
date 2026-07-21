<script setup lang="ts">
import { ref, computed } from 'vue'
import { calendarCards } from '../mock/data'

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)

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

const calendarDays = computed(() => {
  const firstDay = new Date(year.value, month.value - 1, 1).getDay()
  const daysInMonth = new Date(year.value, month.value, 0).getDate()
  const days: Array<{ date: number | null; cards: typeof calendarCards }> = []

  for (let i = 0; i < firstDay; i++) {
    days.push({ date: null, cards: [] })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: d,
      cards: calendarCards.filter(
        (c) => c.date === d && c.month === month.value && c.year === year.value,
      ),
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

const weekDays = ['일', '월', '화', '수', '목', '금', '토']
</script>

<template>
  <div class="calendar-page">
    <div class="cal-header">
      <button class="nav-arrow" @click="prevMonth">&lt;</button>
      <h2 class="month-label">{{ monthLabel }}</h2>
      <button class="nav-arrow" @click="nextMonth">&gt;</button>
    </div>

    <div class="cal-grid">
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
        <div
          v-for="c in cell.cards"
          :key="c.title"
          class="cal-card"
          :style="{ background: c.color + '22', color: c.color }"
        >
          {{ c.title }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/calendar.css"></style>
