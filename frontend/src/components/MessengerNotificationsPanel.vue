<script setup lang="ts">
import { computed } from 'vue'
import {
  notificationState,
  unreadNotificationCount,
} from '../services/notifications'
import type { Notification } from '../types'

const props = withDefaults(
  defineProps<{
    pendingId?: string
    error?: string
  }>(),
  {
    pendingId: '',
    error: '',
  },
)

const emit = defineEmits<{
  open: [notification: Notification]
}>()

const unreadSummary = computed(() =>
  unreadNotificationCount.value === 0
    ? '읽지 않은 알림이 없습니다.'
    : `읽지 않은 알림 ${unreadNotificationCount.value}개`,
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
  <section
    class="messenger-notifications"
    aria-labelledby="messenger-notification-title"
  >
    <header class="messenger-notifications__header">
      <div>
        <h2 id="messenger-notification-title">알림</h2>
        <p>{{ unreadSummary }}</p>
      </div>
      <span class="messenger-notifications__session-label">이번 접속</span>
    </header>

    <p v-if="props.error" class="messenger-notifications__error" role="alert">
      {{ props.error }}
    </p>

    <p
      v-if="notificationState.items.length === 0"
      class="messenger-notifications__empty"
    >
      새 알림이 없습니다.
    </p>

    <ul v-else class="messenger-notifications__list">
      <li v-for="item in notificationState.items" :key="item.id">
        <button
          type="button"
          class="messenger-notifications__item"
          :class="{ 'messenger-notifications__item--unread': !item.read }"
          :disabled="props.pendingId === item.id"
          @click="emit('open', item)"
        >
          <span
            class="messenger-notifications__unread-dot"
            :class="{
              'messenger-notifications__unread-dot--visible': !item.read,
            }"
            aria-hidden="true"
          />
          <img
            v-if="item.actor.profile_image_url"
            :src="item.actor.profile_image_url"
            alt=""
            class="messenger-notifications__avatar"
            referrerpolicy="no-referrer"
          />
          <span v-else class="messenger-notifications__avatar" aria-hidden="true">
            {{ item.actor.name.charAt(0).toUpperCase() }}
          </span>
          <span class="messenger-notifications__content">
            <strong>{{ item.text }}</strong>
            <small>
              {{ props.pendingId === item.id
                ? '대화방을 여는 중…'
                : formatNotificationTime(item.created_at) }}
            </small>
          </span>
          <span class="messenger-notifications__arrow" aria-hidden="true">›</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped src="../styles/messenger-notifications.css"></style>
