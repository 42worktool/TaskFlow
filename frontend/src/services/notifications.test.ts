import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNotifications,
  markNotificationRead,
  notificationState,
  receiveNotification,
  unreadNotificationCount,
} from './notifications'
import type { NotificationEvent } from '../types'

function notification(id: string): NotificationEvent {
  return {
    id,
    category: 'UPDATE',
    kind: 'workspace.member_joined',
    text: '새 멤버가 참여했습니다.',
    created_at: '2026-07-29T00:00:00.000Z',
    workspace_id: '00000000-0000-4000-8000-000000000001',
    actor: {
      user_id: '00000000-0000-4000-8000-000000000002',
      name: 'Invitee',
      profile_image_url: null,
    },
  }
}

describe('notification state', () => {
  beforeEach(clearNotifications)

  it('prepends live notifications and ignores duplicate event IDs', () => {
    receiveNotification(notification('first'))
    receiveNotification(notification('second'))
    receiveNotification(notification('first'))

    expect(notificationState.items.map((item) => item.id)).toEqual([
      'second',
      'first',
    ])
    expect(notificationState.items.every((item) => !item.read)).toBe(true)
    expect(unreadNotificationCount.value).toBe(2)
  })

  it('marks a received notification as read', () => {
    receiveNotification(notification('notification-1'))
    markNotificationRead('notification-1')

    expect(notificationState.items[0]?.read).toBe(true)
    expect(unreadNotificationCount.value).toBe(0)
  })

  it('ignores malformed realtime payloads', () => {
    receiveNotification({
      ...notification('invalid'),
      actor: null,
    })

    expect(notificationState.items).toHaveLength(0)
  })

  it('keeps only the latest 50 notifications and clears the session state', () => {
    for (let index = 0; index <= 50; index += 1) {
      receiveNotification(notification(`notification-${index}`))
    }

    expect(notificationState.items).toHaveLength(50)
    expect(notificationState.items[0]?.id).toBe('notification-50')
    expect(notificationState.items[49]?.id).toBe('notification-1')

    clearNotifications()
    expect(notificationState.items).toHaveLength(0)
  })
})
