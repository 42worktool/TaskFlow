<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import {
  buildDatePickerDays,
  clampDateValue,
  dateValue,
  formatDateValue,
  monthHasSelectableDate,
  parseDateValue,
} from '../utils/datePicker'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    min?: string
    max?: string
    disabled?: boolean
    align?: 'start' | 'end'
  }>(),
  { min: undefined, max: undefined, disabled: false, align: 'start' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const now = new Date()
const today = dateValue(now)
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth() + 1)
const controlId = `date-picker-${useId()}`
const dialogId = `${controlId}-dialog`
const weekDays = ['일', '월', '화', '수', '목', '금', '토']

const displayValue = computed(() => formatDateValue(props.modelValue))
const monthLabel = computed(() => `${viewYear.value}년 ${viewMonth.value}월`)
const days = computed(() =>
  buildDatePickerDays(viewYear.value, viewMonth.value, props.min, props.max, now),
)
const weeks = computed(() =>
  Array.from({ length: 6 }, (_, index) => days.value.slice(index * 7, index * 7 + 7)),
)

function setVisibleMonth(value: string): void {
  const date = parseDateValue(value)
  if (!date) return
  viewYear.value = date.getFullYear()
  viewMonth.value = date.getMonth() + 1
}

function openPicker(): void {
  if (props.disabled) return
  const initial = clampDateValue(props.modelValue || today, props.min, props.max)
  setVisibleMonth(initial)
  open.value = true
}

function closePicker(restoreFocus = false): void {
  open.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}

function togglePicker(): void {
  if (open.value) closePicker()
  else openPicker()
}

function changeMonth(amount: number): void {
  const target = new Date(viewYear.value, viewMonth.value - 1 + amount, 1, 12)
  if (!monthHasSelectableDate(target.getFullYear(), target.getMonth() + 1, props.min, props.max)) {
    return
  }
  viewYear.value = target.getFullYear()
  viewMonth.value = target.getMonth() + 1
}

function canChangeMonth(amount: number): boolean {
  const target = new Date(viewYear.value, viewMonth.value - 1 + amount, 1, 12)
  return monthHasSelectableDate(target.getFullYear(), target.getMonth() + 1, props.min, props.max)
}

function selectDate(value: string): void {
  emit('update:modelValue', value)
  closePicker(true)
}

function handleDocumentPointer(event: PointerEvent): void {
  if (open.value && !root.value?.contains(event.target as Node)) closePicker()
}

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointer))
</script>

<template>
  <div
    ref="root"
    class="relative mb-4! flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold text-slate-700"
    @keydown.esc.stop="closePicker(true)"
  >
    <label :for="controlId">{{ label }}</label>
    <button
      :id="controlId"
      ref="trigger"
      type="button"
      class="flex h-[42px] w-full items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3 text-left font-normal text-slate-900 outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400"
      :disabled="disabled"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="dialogId"
      @click="togglePicker"
    >
      <svg
        aria-hidden="true"
        class="h-4 w-4 shrink-0 text-slate-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        />
      </svg>
      <span class="min-w-0 flex-1 truncate" :class="{ 'text-slate-400': !modelValue }">
        {{ displayValue }}
      </span>
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 scale-95 opacity-0"
      enter-to-class="translate-y-0 scale-100 opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="translate-y-0 scale-100 opacity-100"
      leave-to-class="-translate-y-1 scale-95 opacity-0"
    >
      <div
        v-if="open"
        :id="dialogId"
        role="dialog"
        :aria-label="`${label} 선택`"
        class="absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-3rem)] origin-top rounded-xl border border-slate-200 bg-white p-3 font-normal shadow-xl"
        :class="align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'"
      >
        <div class="mb-3 grid grid-cols-[32px_1fr_32px] items-center">
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:text-slate-300"
            :disabled="!canChangeMonth(-1)"
            aria-label="이전 달"
            @click="changeMonth(-1)"
          >
            <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <strong class="text-center text-sm font-semibold text-slate-900" aria-live="polite">
            {{ monthLabel }}
          </strong>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:text-slate-300"
            :disabled="!canChangeMonth(1)"
            aria-label="다음 달"
            @click="changeMonth(1)"
          >
            <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M8.22 5.22a.75.75 0 0 0 0 1.06L11.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06l4.25-4.25a.75.75 0 0 0 0-1.06L9.28 5.22a.75.75 0 0 0-1.06 0Z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <table class="w-full table-fixed border-collapse text-center" role="grid">
          <thead>
            <tr>
              <th
                v-for="(day, index) in weekDays"
                :key="day"
                scope="col"
                class="pb-2 text-[10px] font-bold uppercase tracking-wider"
                :class="index === 0 ? 'text-rose-400' : 'text-slate-400'"
              >
                {{ day }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(week, weekIndex) in weeks" :key="weekIndex">
              <td v-for="(day, dayIndex) in week" :key="day.value" class="p-0.5">
                <button
                  type="button"
                  class="relative grid aspect-square w-full place-items-center rounded-lg text-xs transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default disabled:opacity-20"
                  :class="{
                    'bg-blue-600 font-bold text-white shadow-md shadow-blue-200 hover:bg-blue-600 hover:text-white':
                      day.value === modelValue,
                    'text-slate-300': !day.inCurrentMonth && day.value !== modelValue,
                    'text-rose-500':
                      dayIndex === 0 && day.inCurrentMonth && day.value !== modelValue,
                    'text-slate-700':
                      dayIndex !== 0 && day.inCurrentMonth && day.value !== modelValue,
                    'font-bold text-blue-700': day.isToday && day.value !== modelValue,
                  }"
                  :disabled="day.disabled"
                  :aria-label="formatDateValue(day.value)"
                  :aria-selected="day.value === modelValue"
                  :aria-current="day.isToday ? 'date' : undefined"
                  @click="selectDate(day.value)"
                >
                  {{ day.day }}
                  <span
                    v-if="day.isToday && day.value !== modelValue"
                    aria-hidden="true"
                    class="absolute bottom-1 h-1 w-1 rounded-full bg-blue-500"
                  ></span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Transition>
  </div>
</template>
