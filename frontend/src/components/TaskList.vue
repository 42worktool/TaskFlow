<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import draggable from 'vuedraggable'
import TaskCard from './TaskCard.vue'
import { isExternalCardDropClaimed } from '../services/messenger'
import type { Card, DraggableChange, ListWithCards } from '../types'

const props = withDefaults(
  defineProps<{
    list: ListWithCards
    canEdit?: boolean
    canOpenDetails?: boolean
    completingCardIds?: ReadonlySet<string>
  }>(),
  {
    canEdit: false,
    canOpenDetails: false,
    completingCardIds: () => new Set<string>(),
  },
)

const emit = defineEmits<{
  'card-change': [listId: string, event: DraggableChange<Card>]
  'update-cards': [listId: string, cards: Card[]]
  'card-drag-start': [card: Card]
  'card-drag-end': []
  'open-card': [card: Card]
  'add-card': [listId: string, title: string]
  'delete-card': [cardId: string]
  'toggle-card-completion': [card: Card]
  'rename-list': [listId: string, name: string]
  'delete-list': [listId: string]
}>()

const badgeColors: Record<string, string> = {
  '할 일': '#6b7280',
  '진행 중': '#2563EB',
  '검토 중': '#F59E0B',
  완료: '#10B981',
}

const showAddCard = ref(false)
const newCardTitle = ref('')
let originPlaceholder: HTMLElement | null = null
const cards = computed({
  get: () => props.list.cards,
  set: (updated) => emit('update-cards', props.list.id, updated),
})

function submitAddCard() {
  if (!props.canEdit) return
  const title = newCardTitle.value.trim()
  showAddCard.value = false
  if (!title) return
  emit('add-card', props.list.id, title)
  newCardTitle.value = ''
}

function cancelAddCard() {
  newCardTitle.value = ''
  showAddCard.value = false
}

const renaming = ref(false)
const renameValue = ref(props.list.name)

function submitRename() {
  if (!props.canEdit || !renaming.value) return
  const name = renameValue.value.trim()
  renaming.value = false
  if (!name || name === props.list.name) {
    renameValue.value = props.list.name
    return
  }
  emit('rename-list', props.list.id, name)
}

function cancelRename() {
  renameValue.value = props.list.name
  renaming.value = false
}

function startRename() {
  if (!props.canEdit) return
  renameValue.value = props.list.name
  renaming.value = true
}

function removeOriginPlaceholder(): void {
  originPlaceholder?.remove()
  originPlaceholder = null
}

function createOriginPlaceholder(item: HTMLElement): void {
  removeOriginPlaceholder()
  const bounds = item.getBoundingClientRect()
  const placeholder = item.cloneNode(true) as HTMLElement
  placeholder.removeAttribute('data-draggable')
  placeholder.removeAttribute('draggable')
  placeholder.setAttribute('aria-hidden', 'true')
  placeholder.inert = true
  placeholder.classList.remove('card-ghost', 'card-drag-preview')
  placeholder.classList.add('card-origin-placeholder')
  Object.assign(placeholder.style, {
    position: 'fixed',
    top: `${bounds.top}px`,
    left: `${bounds.left}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    margin: '0',
    pointerEvents: 'none',
    transform: 'none',
    transition: 'none',
  })
  document.body.appendChild(placeholder)
  originPlaceholder = placeholder
}

function startCardDrag(event: { oldIndex?: number | null; item?: HTMLElement }) {
  const index = event.oldIndex
  if (index === null || index === undefined) return
  const card = props.list.cards[index]
  if (!card) return
  if (event.item) createOriginPlaceholder(event.item)
  emit('card-drag-start', card)
}

function finishCardDrag(): void {
  removeOriginPlaceholder()
  emit('card-drag-end')
}

function canMoveCard(event: { draggedContext?: { element?: Card } }): boolean {
  const cardId = event.draggedContext?.element?.id
  return !cardId || !isExternalCardDropClaimed(cardId)
}

onUnmounted(removeOriginPlaceholder)

const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus(),
}
</script>

<template>
  <section
    class="task-list w-70 shrink-0 flex flex-col border border-transparent p-3 max-h-full"
    :class="{ 'task-list--readonly': !canEdit }"
  >
    <div
      class="list-header flex items-center justify-between mb-3"
      :class="canEdit ? 'cursor-grab' : 'cursor-default'"
    >
      <input
        v-if="renaming"
        v-model="renameValue"
        v-focus
        class="list-name-input text-sm font-semibold text-gray-700 border border-blue-600 rounded py-0.5 px-1 min-w-0 flex-1 mr-2"
        type="text"
        @keyup.enter="submitRename"
        @keyup.esc="cancelRename"
        @blur="submitRename"
      />
      <span
        v-else
        class="list-name text-sm font-semibold text-gray-700"
        :class="canEdit ? 'cursor-text' : 'cursor-default'"
        @click="startRename"
        >{{ list.name }}</span
      >
      <div class="list-header-actions flex items-center gap-1.5 shrink-0">
        <span
          class="list-count w-5.5 h-5.5 rounded-full flex items-center justify-center text-xs font-bold text-white"
          :style="{ background: badgeColors[list.name] ?? '#6b7280' }"
        >
          {{ list.cards.length }}
        </span>
        <button
          v-if="canEdit"
          class="list-delete-btn border-none bg-transparent text-gray-400 text-base leading-none cursor-pointer hover:text-red-500"
          type="button"
          aria-label="리스트 삭제"
          @click="emit('delete-list', list.id)"
        >
          ×
        </button>
      </div>
    </div>

    <draggable
      v-model="cards"
      item-key="id"
      group="board-cards"
      :disabled="!canEdit"
      :move="canMoveCard"
      class="card-list list-none flex flex-col gap-2 overflow-y-auto flex-1 mb-2 min-h-2"
      ghost-class="card-ghost"
      fallback-class="card-drag-preview"
      :force-fallback="true"
      :fallback-on-body="true"
      :scroll="true"
      :scroll-sensitivity="80"
      :scroll-speed="12"
      :bubble-scroll="true"
      :force-auto-scroll-fallback="true"
      @start="startCardDrag"
      @end="finishCardDrag"
      @change="(e: DraggableChange<Card>) => emit('card-change', list.id, e)"
    >
      <template #item="{ element: card }">
        <TaskCard
          :card="card"
          :openable="canOpenDetails"
          :show-delete-action="canEdit"
          :show-completion-action="canEdit"
          :completed="card.is_completed"
          :completion-pending="completingCardIds.has(card.id)"
          @open="emit('open-card', card)"
          @delete="emit('delete-card', card.id)"
          @toggle-completion="emit('toggle-card-completion', card)"
        />
      </template>
    </draggable>

    <form
      v-if="canEdit && showAddCard"
      class="add-card-form mt-1 flex gap-1.5"
      @submit.prevent="submitAddCard"
    >
      <input
        v-model="newCardTitle"
        v-focus
        type="text"
        class="add-card-input flex-1 min-w-0 p-2 border border-blue-600 rounded-md"
        placeholder="카드 제목 입력"
        required
        @keyup.esc="cancelAddCard"
        @blur="submitAddCard"
      />
      <button
        type="submit"
        class="add-card-submit-btn shrink-0 px-3 bg-blue-600 border-none rounded-md font-semibold text-white cursor-pointer disabled:cursor-default disabled:opacity-55"
        :disabled="!newCardTitle.trim()"
      >
        추가
      </button>
    </form>
    <button
      v-else-if="canEdit"
      class="add-card-btn w-full p-2 bg-transparent border-none rounded-md text-gray-500 cursor-pointer text-left mt-1 hover:bg-black/5 hover:text-gray-700"
      type="button"
      @click="showAddCard = true"
    >
      + 카드 추가
    </button>
  </section>
</template>

<style scoped src="../styles/task-list.css"></style>
