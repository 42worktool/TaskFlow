<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  markNotificationRead,
  notificationState,
} from '../services/notifications'

const open = ref(false)
const activeFilter = ref<'알림' | '멘션' | '업데이트'>('알림')

const filteredNotifications = computed(() => {
  if (activeFilter.value === '알림') return notificationState.items
  const category = activeFilter.value === '멘션' ? 'MENTION' : 'UPDATE'
  return notificationState.items.filter((item) => item.category === category)
})

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
</script>

<template>
  <div class="notification-menu">
    <button
      type="button"
      class="notification-button"
      aria-label="알림 열기"
      @click="open = !open"
      @blur="open = false"
    >
      알림
      <span v-if="unreadCount" class="notification-badge">{{ unreadCount }}</span>
    </button>

    <div v-if="open" class="notification-panel" @mousedown.prevent>
      <div class="filter-row">
        <button
          v-for="filter in ['알림', '멘션', '업데이트'] as const"
          :key="filter"
          type="button"
          class="filter-btn"
          :class="{ 'filter-btn--active': activeFilter === filter }"
          @click="activeFilter = filter"
        >
          {{ filter }}
        </button>
      </div>

      <ul class="notification-list">
        <li v-if="filteredNotifications.length === 0" class="notification-empty">
          새 알림이 없습니다.
        </li>
        <li
          v-for="item in filteredNotifications"
          :key="item.id"
          class="notification-item"
          @click="markNotificationRead(item.id)"
        >
          <span class="unread-dot" :class="{ visible: !item.read }" />
          <div class="notif-avatar">
            {{ item.actor.name[0] }}
          </div>
          <div class="notif-content">
            <p class="notif-text">{{ item.text }}</p>
            <span class="notif-time">{{ formatNotificationTime(item.created_at) }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped src="../styles/notification-menu.css"></style>
