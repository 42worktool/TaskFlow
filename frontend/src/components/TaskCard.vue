<script setup lang="ts">
import type { Card } from '../types'

// 보드와 인박스가 공통으로 쓰는 카드 표현이며, 열기·삭제·완료 행동은 부모가 실제 저장을 담당한다.
const props = withDefaults(
  defineProps<{
    card: Card
    openable?: boolean
    showDeleteAction?: boolean
    showCompletionAction?: boolean
    completed?: boolean
    completionPending?: boolean
  }>(),
  {
    openable: true,
    showDeleteAction: true,
    showCompletionAction: false,
    completed: false,
    completionPending: false,
  },
)

const emit = defineEmits<{
  open: [card: Card]
  delete: [cardId: string]
  'toggle-completion': [card: Card]
}>()

function formatDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function openCard() {
  if (props.openable) emit('open', props.card)
}

function getLabelTextColor(hex: string): string {
  // 배경색의 상대 휘도로 라벨 글자색을 정해 사용자 지정 색에서도 대비를 유지한다.
  const normalized = hex.replace('#', '')
  if (!/^[\da-f]{6}$/i.test(normalized)) return '#111827'

  const channels = [0, 2, 4].map(
    (index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255,
  )
  const luminance = channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    return total + linear * [0.2126, 0.7152, 0.0722][index]
  }, 0)

  return luminance > 0.179 ? '#111827' : '#fff'
}
</script>

<template>
  <article
    class="task-card group bg-white rounded-lg border border-transparent p-3 cursor-grab select-none active:cursor-grabbing"
    :class="{ 'task-card--completed': completed }"
  >
    <div class="card-title-row flex items-start justify-between gap-2 mb-2.5">
      <span
        class="card-title flex-1 min-w-0 text-sm font-medium text-left"
        :class="{
          'cursor-pointer hover:text-blue-600 focus-visible:text-blue-600': openable,
          'text-slate-500': completed,
          'text-gray-900': !completed,
        }"
        :role="openable ? 'button' : undefined"
        :tabindex="openable ? 0 : undefined"
        @click.stop="openCard"
        @keydown.enter.stop="openCard"
        @keydown.space.prevent.stop="openCard"
      >
        {{ card.title }}
      </span>
      <button
        v-if="showDeleteAction"
        class="card-delete-btn shrink-0 border-none bg-transparent text-gray-400 text-base leading-none cursor-pointer px-0.5 invisible group-hover:visible hover:text-red-500"
        type="button"
        aria-label="카드 삭제"
        @click.stop="emit('delete', card.id)"
      >
        ×
      </button>
    </div>
    <div
      v-if="card.labels?.length"
      class="card-labels flex flex-wrap gap-1 -mt-0.75 mb-2.25"
      aria-label="카드 라벨"
    >
      <span
        v-for="label in card.labels"
        :key="label.label_id"
        class="card-label max-w-full overflow-hidden rounded py-0.75 px-1.75 text-white font-bold text-ellipsis whitespace-nowrap"
        :style="{ backgroundColor: label.label_color, color: getLabelTextColor(label.label_color) }"
        :title="label.label_name"
      >
        {{ label.label_name }}
      </span>
    </div>
    <div class="card-meta flex items-center gap-1.5">
      <button
        v-if="showCompletionAction"
        class="card-completion-btn inline-flex items-center gap-1 min-h-6 py-0.75 pr-1.75 pl-1.25 border border-gray-300 rounded-full bg-white text-slate-500 cursor-pointer font-bold disabled:cursor-wait disabled:opacity-60"
        :class="{ 'border-green-200 bg-green-50 text-green-700': completed }"
        type="button"
        :disabled="completionPending"
        :aria-label="
          completionPending ? '카드 상태 변경 중' : completed ? '카드 다시 열기' : '카드 완료'
        "
        :title="completed ? '다시 열기' : '완료'"
        @pointerdown.stop
        @click.stop="emit('toggle-completion', card)"
      >
        <svg
          v-if="!completed"
          class="w-3.5 h-3.5 fill-none stroke-current"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="m6.5 10 2.2 2.2 4.8-5" />
        </svg>
        <svg
          v-else
          class="w-3.5 h-3.5 fill-none stroke-current"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M6.4 6.8H3.5V3.9" />
          <path d="M3.8 6.4a6.5 6.5 0 1 1-.2 6.8" />
        </svg>
        <span>{{ completionPending ? '변경 중…' : completed ? '다시 열기' : '완료' }}</span>
      </button>
      <span v-if="card.deadline" class="card-date text-xs text-gray-500 ml-auto">{{
        formatDate(card.deadline)
      }}</span>
    </div>
  </article>
</template>

<style scoped src="../styles/task-card.css"></style>
