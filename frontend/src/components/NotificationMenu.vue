<script setup lang="ts">
import { computed, ref } from 'vue'
import { notifications } from '../mock/data'

const open = ref(false)
const activeFilter = ref<'알림' | '멘션' | '업데이트'>('알림')

const filteredNotifications = computed(() => {
  if (activeFilter.value === '알림') return notifications
  if (activeFilter.value === '멘션') return notifications.filter((item) => item.text.includes('님'))
  return notifications.filter((item) => item.text.includes('완료') || item.text.includes('참여'))
})

const unreadCount = computed(() => notifications.filter((item) => !item.read).length)
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
        <li v-for="item in filteredNotifications" :key="item.id" class="notification-item">
          <span class="unread-dot" :class="{ visible: !item.read }" />
          <div class="notif-avatar" :style="{ background: item.avatar_color }">
            {{ item.avatar }}
          </div>
          <div class="notif-content">
            <p class="notif-text">{{ item.text }}</p>
            <span class="notif-time">{{ item.time }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped src="../styles/notification-menu.css"></style>
