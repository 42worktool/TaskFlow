<script setup lang="ts">
import type { Card } from '../types'

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
</script>

<template>
  <article
    class="task-card"
    :class="{ 'task-card--completed': completed }"
  >
    <div class="card-title-row">
      <span
        class="card-title"
        :class="{ 'card-title--openable': openable }"
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
        class="card-delete-btn"
        type="button"
        aria-label="카드 삭제"
        @click.stop="emit('delete', card.id)"
      >
        ×
      </button>
    </div>
    <div class="card-meta">
      <button
        v-if="showCompletionAction"
        class="card-completion-btn"
        :class="{ 'card-completion-btn--completed': completed }"
        type="button"
        :disabled="completionPending"
        :aria-label="
          completionPending
            ? '카드 상태 변경 중'
            : completed
              ? '카드 다시 열기'
              : '카드 완료'
        "
        :title="completed ? '다시 열기' : '완료'"
        @pointerdown.stop
        @click.stop="emit('toggle-completion', card)"
      >
        <svg v-if="!completed" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <path d="m6.5 10 2.2 2.2 4.8-5" />
        </svg>
        <svg v-else viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6.4 6.8H3.5V3.9" />
          <path d="M3.8 6.4a6.5 6.5 0 1 1-.2 6.8" />
        </svg>
        <span>{{ completionPending ? '변경 중…' : completed ? '다시 열기' : '완료' }}</span>
      </button>
      <span v-if="card.deadline" class="card-date">{{ formatDate(card.deadline) }}</span>
    </div>
  </article>
</template>

<style scoped src="../styles/task-card.css"></style>
