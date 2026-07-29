<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import {
  markNotificationRead,
  notificationState,
} from '../services/notifications'

const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)

const unreadCount = computed(
  () => notificationState.items.filter((item) => !item.read).length,
)

function formatNotificationTime(createdAt: string): string {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return ''
  return created.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function closeWhenFocusLeaves(event: FocusEvent): void {
  const menu = event.currentTarget as HTMLElement
  const next = event.relatedTarget
  if (!(next instanceof Node) || !menu.contains(next)) open.value = false
}

function openNotification(id: string): void {
  markNotificationRead(id)
  open.value = false
}

function closeFromKeyboard(): void {
  open.value = false
  void nextTick(() => trigger.value?.focus())
}
</script>

<template>
  <div
    class="notification-menu"
    @focusout="closeWhenFocusLeaves"
    @keydown.esc.prevent.stop="closeFromKeyboard"
  >
    <button
      ref="trigger"
      type="button"
      class="notification-button"
      aria-label="알림 열기"
      aria-controls="notification-panel"
      :aria-expanded="open"
      @click="open = !open"
    >
      알림
      <span v-if="unreadCount" class="notification-badge">{{ unreadCount }}</span>
    </button>

    <div v-if="open" id="notification-panel" class="notification-panel">
      <p class="notification-panel-title">이번 접속의 알림</p>

      <ul class="notification-list">
        <li v-if="notificationState.items.length === 0" class="notification-empty">
          새 알림이 없습니다.
        </li>
        <li
          v-for="item in notificationState.items"
          :key="item.id"
        >
          <RouterLink
            :to="`/workspaces/${item.workspace_id}/board`"
            class="notification-item"
            @click="openNotification(item.id)"
          >
            <span class="unread-dot" :class="{ visible: !item.read }" />
            <div class="notif-avatar">
              {{ item.actor.name[0] }}
            </div>
            <div class="notif-content">
              <p class="notif-text">{{ item.text }}</p>
              <span class="notif-time">{{ formatNotificationTime(item.created_at) }}</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped src="../styles/notification-menu.css"></style>
