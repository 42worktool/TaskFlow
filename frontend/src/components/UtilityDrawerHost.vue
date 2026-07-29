<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FriendsPanel from './FriendsPanel.vue'
import InboxCardsPanel from './InboxCardsPanel.vue'
import { authState } from '../services/auth'
import {
  closeUtilityDrawer,
  notifyBoardChanged,
  openUtilityDrawer,
  utilityDrawerState,
  type UtilityDrawer,
} from '../services/utilityDrawer'

const route = useRoute()
const router = useRouter()
const closeButton = ref<HTMLButtonElement | null>(null)
let returnFocus: HTMLElement | null = null

const title = computed(() =>
  utilityDrawerState.active === 'friends' ? '친구' : '인박스',
)

function drawerFromQuery(value: unknown): UtilityDrawer | null {
  return value === 'friends' || value === 'inbox' ? value : null
}

function removeDrawerQuery(): void {
  if (!drawerFromQuery(route.query.drawer)) return
  const query = { ...route.query }
  delete query.drawer
  void router.replace({ query })
}

function closeDrawer(): void {
  closeUtilityDrawer()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && utilityDrawerState.active) closeDrawer()
}

watch(
  () => utilityDrawerState.active,
  async (active, previous) => {
    const requested = drawerFromQuery(route.query.drawer)
    if (requested && active === null) removeDrawerQuery()
    else if (requested && active !== requested) {
      void router.replace({
        query: {
          ...route.query,
          drawer: active,
        },
      })
    }

    if (active) {
      if (!previous) {
        const focused = document.activeElement
        returnFocus =
          focused instanceof HTMLElement && focused !== document.body
            ? focused
            : null
      }
      await nextTick()
      closeButton.value?.focus()
    } else if (previous) {
      await nextTick()
      returnFocus?.focus()
      returnFocus = null
    }
  },
)

watch(
  () => route.query.drawer,
  (value) => {
    const requested = drawerFromQuery(value)
    if (authState.user && requested) openUtilityDrawer(requested)
  },
  { immediate: true },
)

watch(
  () => authState.user?.id,
  (userId, previousUserId) => {
    if (userId !== previousUserId) closeUtilityDrawer()
  },
)

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="authState.user && utilityDrawerState.active"
      class="utility-drawer-backdrop"
      @click="closeDrawer"
    />
    <aside
      v-if="authState.user"
      id="utility-drawer"
      class="utility-drawer"
      :class="{
        'utility-drawer--open': utilityDrawerState.active,
        'utility-drawer--friends': utilityDrawerState.active === 'friends',
      }"
      :aria-hidden="utilityDrawerState.active ? 'false' : 'true'"
      :aria-labelledby="utilityDrawerState.active ? 'utility-drawer-title' : undefined"
    >
      <header v-if="utilityDrawerState.active" class="utility-drawer-header">
        <h2 id="utility-drawer-title">{{ title }}</h2>
        <button
          ref="closeButton"
          class="utility-drawer-close"
          type="button"
          :aria-label="`${title} 닫기`"
          @click="closeDrawer"
        >
          ×
        </button>
      </header>
      <div v-if="utilityDrawerState.active" class="utility-drawer-body">
        <FriendsPanel v-if="utilityDrawerState.active === 'friends'" />
        <InboxCardsPanel
          v-else
          compact
          :destination-lists="utilityDrawerState.inboxDestinations"
          :refresh-token="utilityDrawerState.inboxRefreshToken"
          @moved="notifyBoardChanged"
        />
      </div>
    </aside>
  </Teleport>
</template>

<style scoped src="../styles/utility-drawer.css"></style>
