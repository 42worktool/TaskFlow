<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
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
    movingCardIds?: ReadonlySet<string>
    movingList?: boolean
  }>(),
  {
    canEdit: false,
    canOpenDetails: false,
    completingCardIds: () => new Set<string>(),
    movingCardIds: () => new Set<string>(),
    movingList: false,
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
  'move-card': [cardId: string, direction: 'previous' | 'next']
  'move-list': [listId: string, direction: 'previous' | 'next']
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
type MoveTarget = {
  kind: 'card' | 'list'
  id: string
  label: string
  anchor: HTMLElement
}
const moveMenu = ref<MoveTarget | null>(null)
const moveMenuElement = ref<HTMLElement | null>(null)
const moveMenuStyle = ref<Record<string, string>>({ visibility: 'hidden' })
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

function isMoveMenuOpen(kind: MoveTarget['kind'], id: string): boolean {
  return moveMenu.value?.kind === kind && moveMenu.value.id === id
}

function closeMoveMenu(restoreFocus = false): void {
  const anchor = moveMenu.value?.anchor
  moveMenu.value = null
  moveMenuStyle.value = { visibility: 'hidden' }
  if (restoreFocus && anchor) void nextTick(() => anchor.focus())
}

function positionMoveMenu(): void {
  const target = moveMenu.value
  const menu = moveMenuElement.value
  if (!target || !menu) return

  const gap = 8
  const margin = 8
  const anchorBounds = target.anchor.getBoundingClientRect()
  const menuBounds = menu.getBoundingClientRect()
  let left = anchorBounds.right + gap
  if (left + menuBounds.width > window.innerWidth - margin) {
    left = anchorBounds.left - menuBounds.width - gap
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - menuBounds.width - margin))
  const top = Math.max(
    margin,
    Math.min(anchorBounds.top, window.innerHeight - menuBounds.height - margin),
  )
  moveMenuStyle.value = { top: `${top}px`, left: `${left}px` }
}

function openMoveMenu(kind: MoveTarget['kind'], id: string, label: string, event: Event): void {
  if (!props.canEdit) return
  const anchor = event.currentTarget
  if (!(anchor instanceof HTMLElement)) return
  if (isMoveMenuOpen(kind, id)) {
    closeMoveMenu(true)
    return
  }

  moveMenu.value = { kind, id, label, anchor }
  moveMenuStyle.value = { visibility: 'hidden' }
  void nextTick(async () => {
    positionMoveMenu()
    await nextTick()
    moveMenuElement.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  })
}

function moveSelectedTarget(direction: 'previous' | 'next'): void {
  const target = moveMenu.value
  if (!target) return
  if (target.kind === 'card') emit('move-card', target.id, direction)
  else emit('move-list', target.id, direction)
  closeMoveMenu(true)
}

function handleMoveMenuFocusOut(): void {
  void nextTick(() => {
    const target = moveMenu.value
    const active = document.activeElement
    if (
      !target ||
      !(active instanceof Node) ||
      moveMenuElement.value?.contains(active) ||
      target.anchor.contains(active)
    ) {
      return
    }
    closeMoveMenu()
  })
}

function handleMoveMenuKeydown(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const buttons = [
    ...(moveMenuElement.value?.querySelectorAll<HTMLButtonElement>('button') ?? []),
  ].filter((button) => !button.disabled)
  if (buttons.length === 0) return

  event.preventDefault()
  const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Home') buttons[0]?.focus()
  else if (event.key === 'End') buttons.at(-1)?.focus()
  else if (event.key === 'ArrowDown') buttons[(currentIndex + 1) % buttons.length]?.focus()
  else buttons[(currentIndex - 1 + buttons.length) % buttons.length]?.focus()
}

function handleOutsidePointerDown(event: PointerEvent): void {
  const target = moveMenu.value
  const clicked = event.target
  if (
    !target ||
    !(clicked instanceof Node) ||
    moveMenuElement.value?.contains(clicked) ||
    target.anchor.contains(clicked)
  ) {
    return
  }
  closeMoveMenu()
}

function handleViewportChange(): void {
  if (moveMenu.value) closeMoveMenu()
}

onMounted(() => {
  window.addEventListener('pointerdown', handleOutsidePointerDown, true)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})

onUnmounted(() => {
  removeOriginPlaceholder()
  window.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})

const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus(),
}
</script>

<template>
  <section
    class="task-list w-70 shrink-0 flex flex-col border border-transparent p-3 max-h-full focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2"
    :class="{
      'task-list--readonly': !canEdit,
      'outline-2 outline-blue-600 outline-offset-2': isMoveMenuOpen('list', list.id),
    }"
    :tabindex="canEdit ? 0 : undefined"
    :aria-label="canEdit ? `${list.name} 리스트. Enter 키로 이동 메뉴 열기` : undefined"
    @keydown.enter.self.prevent="openMoveMenu('list', list.id, list.name, $event)"
    @keydown.space.self.prevent="openMoveMenu('list', list.id, list.name, $event)"
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
        <div
          class="card-item relative rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-[-2px]"
          :class="{
            'outline-2 outline-blue-600 outline-offset-[-2px]': isMoveMenuOpen('card', card.id),
          }"
          :tabindex="canEdit ? 0 : undefined"
          :aria-label="canEdit ? `${card.title} 카드. Enter 키로 이동 메뉴 열기` : undefined"
          @keydown.enter.self.prevent="openMoveMenu('card', card.id, card.title, $event)"
          @keydown.space.self.prevent="openMoveMenu('card', card.id, card.title, $event)"
        >
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
        </div>
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

    <Teleport to="body">
      <div
        v-if="moveMenu"
        ref="moveMenuElement"
        class="fixed z-200 grid min-w-39 p-1.5 border border-slate-200 rounded-xl bg-white shadow-xl"
        :style="moveMenuStyle"
        role="menu"
        :aria-label="`${moveMenu.label} 이동`"
        @keydown.esc.stop.prevent="closeMoveMenu(true)"
        @keydown="handleMoveMenuKeydown"
        @focusout="handleMoveMenuFocusOut"
      >
        <strong
          class="max-w-48 py-1.75 px-2 overflow-hidden text-xs text-slate-500 text-ellipsis whitespace-nowrap"
          >{{ moveMenu.label }}</strong
        >
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2 py-2 px-2.5 border-0 rounded-lg bg-transparent text-left text-xs font-semibold text-slate-700 cursor-pointer hover:bg-blue-50 hover:text-blue-700 focus-visible:bg-blue-50 focus-visible:text-blue-700 focus-visible:outline-none disabled:cursor-default disabled:opacity-55"
          :disabled="moveMenu.kind === 'card' ? movingCardIds.has(moveMenu.id) : movingList"
          @click="moveSelectedTarget('previous')"
        >
          <span aria-hidden="true">←</span>
          이전으로 이동
        </button>
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2 py-2 px-2.5 border-0 rounded-lg bg-transparent text-left text-xs font-semibold text-slate-700 cursor-pointer hover:bg-blue-50 hover:text-blue-700 focus-visible:bg-blue-50 focus-visible:text-blue-700 focus-visible:outline-none disabled:cursor-default disabled:opacity-55"
          :disabled="moveMenu.kind === 'card' ? movingCardIds.has(moveMenu.id) : movingList"
          @click="moveSelectedTarget('next')"
        >
          <span aria-hidden="true">→</span>
          다음으로 이동
        </button>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="../styles/task-list.css"></style>
