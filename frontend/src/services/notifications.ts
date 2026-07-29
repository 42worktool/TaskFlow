import { reactive } from 'vue'
import { realtime } from './realtime'
import type { Notification, NotificationEvent } from '../types'

const MAX_RECENT_NOTIFICATIONS = 50

export const notificationState = reactive({
  items: [] as Notification[],
})

export function parseNotificationEvent(value: unknown): NotificationEvent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<NotificationEvent>
  const actor = candidate.actor
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.length === 0 ||
    (candidate.category !== 'MENTION' && candidate.category !== 'UPDATE') ||
    candidate.kind !== 'workspace.member_joined' ||
    typeof candidate.text !== 'string' ||
    candidate.text.length === 0 ||
    typeof candidate.created_at !== 'string' ||
    !Number.isFinite(Date.parse(candidate.created_at)) ||
    typeof candidate.workspace_id !== 'string' ||
    candidate.workspace_id.length === 0 ||
    !actor ||
    typeof actor !== 'object' ||
    typeof actor.user_id !== 'string' ||
    actor.user_id.length === 0 ||
    typeof actor.name !== 'string' ||
    actor.name.length === 0 ||
    (actor.profile_image_url !== null &&
      typeof actor.profile_image_url !== 'string')
  ) {
    return null
  }
  return candidate as NotificationEvent
}

export function receiveNotification(value: unknown): void {
  const event = parseNotificationEvent(value)
  if (!event) return
  if (notificationState.items.some((item) => item.id === event.id)) return

  notificationState.items.unshift({ ...event, read: false })
  if (notificationState.items.length > MAX_RECENT_NOTIFICATIONS) {
    notificationState.items.length = MAX_RECENT_NOTIFICATIONS
  }
}

export function markNotificationRead(id: string): void {
  const notification = notificationState.items.find((item) => item.id === id)
  if (notification) notification.read = true
}

export function clearNotifications(): void {
  notificationState.items.length = 0
}

realtime.on('notification.created', receiveNotification)
