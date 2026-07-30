<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type CSSProperties,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FriendsPanel from './FriendsPanel.vue'
import WorkspaceChatPanel from './WorkspaceChatPanel.vue'
import { authState } from '../services/auth'
import {
  clampFloatingPosition,
  closeMessenger,
  exceedsDragThreshold,
  messengerState,
  openMessenger,
  resetMessenger,
  toggleMessenger,
  type FloatingPosition,
  type MessengerPane,
} from '../services/messenger'

type FloatingTarget = 'launcher' | 'window'

interface ActivePointerDrag {
  target: FloatingTarget
  pointerId: number
  start: FloatingPosition
  origin: FloatingPosition
  moved: boolean
}

const route = useRoute()
const router = useRouter()
const closeButton = ref<HTMLButtonElement | null>(null)
const launcher = ref<HTMLButtonElement | null>(null)
const messengerWindow = ref<HTMLElement | null>(null)
const launcherPosition = ref<FloatingPosition | null>(null)
const windowPosition = ref<FloatingPosition | null>(null)
const activeDrag = ref<ActivePointerDrag | null>(null)
const compactViewport = ref(false)
const visited = ref<Record<MessengerPane, boolean>>({
  friends: false,
  chat: false,
})
let suppressLauncherClick = false
let returnFocus: HTMLElement | null = null

const mobileWorkspaceIndex = computed(
  () => compactViewport.value && route.path === '/workspaces',
)
const launcherStyle = computed(() =>
  mobileWorkspaceIndex.value ? {} : positionStyle(launcherPosition.value),
)
const mobilePageMode = computed(
  () => compactViewport.value && Boolean(messengerState.workspace),
)
const windowStyle = computed(() =>
  mobilePageMode.value ? {} : positionStyle(windowPosition.value),
)

function paneFromQuery(value: unknown): MessengerPane | null {
  return value === 'friends' || value === 'chat' ? value : null
}

function positionStyle(position: FloatingPosition | null): CSSProperties {
  if (!position) return {}
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
    right: 'auto',
    bottom: 'auto',
  }
}

function elementFor(target: FloatingTarget): HTMLElement | null {
  return target === 'launcher' ? launcher.value : messengerWindow.value
}

function positionFor(target: FloatingTarget): FloatingPosition | null {
  return target === 'launcher'
    ? launcherPosition.value
    : windowPosition.value
}

function setPosition(target: FloatingTarget, position: FloatingPosition): void {
  if (target === 'launcher') {
    launcherPosition.value = position
  } else {
    windowPosition.value = position
  }
}

function clampPosition(
  target: FloatingTarget,
  position: FloatingPosition,
): FloatingPosition {
  const element = elementFor(target)
  if (!element) return position
  const bounds = element.getBoundingClientRect()
  return clampFloatingPosition(
    position,
    { width: bounds.width, height: bounds.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
}

function syncPosition(target: FloatingTarget): void {
  const element = elementFor(target)
  if (!element) return
  const current = positionFor(target)
  const bounds = element.getBoundingClientRect()
  setPosition(
    target,
    clampPosition(
      target,
      current ?? {
        x: bounds.left,
        y: bounds.top,
      },
    ),
  )
}

async function syncFloatingPositions(): Promise<void> {
  await nextTick()
  if (mobilePageMode.value) return
  syncPosition('launcher')
  syncPosition('window')
}

async function resetDesktopFloatingPositions(): Promise<void> {
  await nextTick()
  for (const target of ['launcher', 'window'] as const) {
    const element = elementFor(target)
    if (!element) continue
    const bounds = element.getBoundingClientRect()
    const bottom = target === 'launcher' ? 20 : 84
    setPosition(
      target,
      clampPosition(target, {
        x: window.innerWidth - bounds.width - 20,
        y: window.innerHeight - bounds.height - bottom,
      }),
    )
  }
}

function clearMessengerQuery(): void {
  if (
    !paneFromQuery(route.query.messenger) &&
    !paneFromQuery(route.query.drawer)
  ) {
    return
  }
  const query = { ...route.query }
  delete query.messenger
  delete query.drawer
  void router.replace({ query })
}

function selectPane(pane: MessengerPane): void {
  if (pane === 'chat' && !messengerState.workspace) return
  openMessenger(pane)
}

function cancelPointerDrag(): void {
  if (activeDrag.value?.target === 'launcher') {
    suppressLauncherClick = true
  }
  activeDrag.value = null
}

function closeWindow(): void {
  cancelPointerDrag()
  closeMessenger()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && messengerState.open) closeWindow()
}

function startPointerDrag(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  if (mobilePageMode.value) return
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
    return
  }
  if (
    target === 'window' &&
    event.target instanceof Element &&
    event.target.closest('button')
  ) {
    return
  }

  syncPosition(target)
  const origin = positionFor(target)
  if (!origin) return

  if (target === 'launcher') suppressLauncherClick = false
  activeDrag.value = {
    target,
    pointerId: event.pointerId,
    start: { x: event.clientX, y: event.clientY },
    origin: { ...origin },
    moved: false,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function movePointerDrag(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  const drag = activeDrag.value
  if (
    !drag ||
    drag.target !== target ||
    drag.pointerId !== event.pointerId
  ) {
    return
  }

  const current = { x: event.clientX, y: event.clientY }
  if (!drag.moved && !exceedsDragThreshold(drag.start, current)) return
  drag.moved = true
  setPosition(
    target,
    clampPosition(target, {
      x: drag.origin.x + current.x - drag.start.x,
      y: drag.origin.y + current.y - drag.start.y,
    }),
  )
  event.preventDefault()
}

function finishPointerDrag(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  const drag = activeDrag.value
  if (
    !drag ||
    drag.target !== target ||
    drag.pointerId !== event.pointerId
  ) {
    return
  }

  if (target === 'launcher' && drag.moved) suppressLauncherClick = true
  activeDrag.value = null
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId)
  }
}

function cancelPointerDragFor(
  event: PointerEvent,
  target: FloatingTarget,
): void {
  const drag = activeDrag.value
  if (
    !drag ||
    drag.target !== target ||
    drag.pointerId !== event.pointerId
  ) {
    return
  }
  activeDrag.value = null
  if (target === 'launcher') suppressLauncherClick = false
}

function handleLauncherClick(event: MouseEvent): void {
  if (suppressLauncherClick) {
    suppressLauncherClick = false
    event.preventDefault()
    return
  }
  toggleMessenger()
}

function handleResize(): void {
  compactViewport.value = window.matchMedia('(max-width: 760px)').matches
  if (mobilePageMode.value) {
    cancelPointerDrag()
    return
  }
  syncPosition('launcher')
  syncPosition('window')
}

watch(
  [() => messengerState.open, () => messengerState.pane],
  async ([open, pane], [previousOpen]) => {
    if (open) visited.value[pane] = true

    if (open && !previousOpen) {
      const focused = document.activeElement
      returnFocus =
        focused instanceof HTMLElement && focused !== document.body
          ? focused
          : null
      await nextTick()
      if (!mobilePageMode.value) syncPosition('window')
      closeButton.value?.focus()
    } else if (!open && previousOpen) {
      await nextTick()
      ;(returnFocus ?? launcher.value)?.focus()
      returnFocus = null
    }
  },
)

watch(
  [
    () => route.query.messenger,
    () => route.query.drawer,
    () => messengerState.workspace?.id,
    () => authState.user?.id,
  ],
  ([messengerQuery, legacyDrawer]) => {
    if (!authState.user) return
    const requested =
      paneFromQuery(messengerQuery) ?? paneFromQuery(legacyDrawer)
    if (!requested || (requested === 'chat' && !messengerState.workspace)) return
    openMessenger(requested)
    clearMessengerQuery()
  },
  { immediate: true },
)

watch(
  () => authState.user?.id,
  async (userId, previousUserId) => {
    if (previousUserId && userId !== previousUserId) {
      resetMessenger()
      visited.value = { friends: false, chat: false }
    }
    if (userId) await syncFloatingPositions()
  },
)

watch(mobilePageMode, async (enabled, previousEnabled) => {
  if (enabled) {
    cancelPointerDrag()
    return
  }
  if (previousEnabled) {
    await resetDesktopFloatingPositions()
  }
})

onMounted(() => {
  compactViewport.value = window.matchMedia('(max-width: 760px)').matches
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
  void syncFloatingPositions()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <Teleport to="body">
    <template v-if="authState.user">
      <aside
        id="messenger-window"
        ref="messengerWindow"
        class="messenger-window"
        :class="{
          'messenger-window--open': messengerState.open,
          'messenger-window--moving': activeDrag?.target === 'window',
          'messenger-window--workspace-context': messengerState.workspace,
        }"
        :style="windowStyle"
        :aria-hidden="messengerState.open ? 'false' : 'true'"
        aria-label="메신저"
      >
        <header
          class="messenger-header"
          :title="
            mobilePageMode ? undefined : '드래그하여 메신저 이동'
          "
          @pointerdown="startPointerDrag($event, 'window')"
          @pointermove="movePointerDrag($event, 'window')"
          @pointerup="finishPointerDrag($event, 'window')"
          @pointercancel="cancelPointerDragFor($event, 'window')"
        >
          <div>
            <strong>TaskFlow 메신저</strong>
            <span v-if="messengerState.workspace">
              {{ messengerState.workspace.name }}
            </span>
          </div>
          <button
            ref="closeButton"
            class="messenger-close"
            type="button"
            aria-label="메신저 닫기"
            @click="closeWindow"
          >
            ×
          </button>
        </header>

        <nav class="messenger-tabs" aria-label="메신저 메뉴">
          <button
            type="button"
            :class="{ 'messenger-tab--active': messengerState.pane === 'friends' }"
            @click="selectPane('friends')"
          >
            친구
          </button>
          <button
            type="button"
            :disabled="!messengerState.workspace"
            :title="
              messengerState.workspace
                ? '현재 워크스페이스 채팅'
                : '워크스페이스 안에서 사용할 수 있습니다.'
            "
            :class="{ 'messenger-tab--active': messengerState.pane === 'chat' }"
            @click="selectPane('chat')"
          >
            채팅
          </button>
        </nav>

        <div class="messenger-body">
          <div
            v-if="visited.friends"
            v-show="messengerState.pane === 'friends'"
            class="messenger-pane"
          >
            <FriendsPanel />
          </div>
          <div
            v-if="visited.chat && messengerState.workspace"
            v-show="messengerState.pane === 'chat'"
            class="messenger-pane"
          >
            <WorkspaceChatPanel
              :key="messengerState.workspace.id"
              :workspace-id="messengerState.workspace.id"
              :workspace-name="messengerState.workspace.name"
              :workspace-sync-version="messengerState.workspace.syncVersion"
            />
          </div>
        </div>
      </aside>

      <button
        ref="launcher"
        class="messenger-launcher"
        :class="{
          'messenger-launcher--moving': activeDrag?.target === 'launcher',
          'messenger-launcher--workspace-context': messengerState.workspace,
          'messenger-launcher--above-toolbox': mobileWorkspaceIndex,
        }"
        :style="launcherStyle"
        type="button"
        :aria-label="messengerState.open ? '메신저 닫기' : '메신저 열기'"
        aria-controls="messenger-window"
        :aria-expanded="messengerState.open"
        @pointerdown="startPointerDrag($event, 'launcher')"
        @pointermove="movePointerDrag($event, 'launcher')"
        @pointerup="finishPointerDrag($event, 'launcher')"
        @pointercancel="cancelPointerDragFor($event, 'launcher')"
        @click="handleLauncherClick"
      >
        <span aria-hidden="true">●</span>
        <span aria-hidden="true">💬</span>
      </button>
    </template>
  </Teleport>
</template>

<style scoped src="../styles/messenger.css"></style>
