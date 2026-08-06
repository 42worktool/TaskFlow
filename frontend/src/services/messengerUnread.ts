import { computed, reactive } from 'vue'
import type { DirectMessage, NotificationEvent, WorkspaceMessage } from '../types'

export interface VisibleMessengerRoom {
  kind: 'workspace' | 'dm'
  id: string
}

export const messengerUnreadState = reactive({
  workspaces: {} as Record<string, number>,
  directMessages: {} as Record<string, number>,
})

export const totalMessengerUnreadCount = computed(
  () =>
    Object.values(messengerUnreadState.workspaces).reduce((total, count) => total + count, 0) +
    Object.values(messengerUnreadState.directMessages).reduce((total, count) => total + count, 0),
)

export function formatMessengerUnreadCount(count: number): string {
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

export function workspaceUnreadCount(workspaceId: string): number {
  return messengerUnreadState.workspaces[workspaceId] ?? 0
}

export function directMessageUnreadCount(friendId: string): number {
  return messengerUnreadState.directMessages[friendId] ?? 0
}

export function markWorkspaceConversationRead(workspaceId: string): void {
  delete messengerUnreadState.workspaces[workspaceId]
}

export function markDirectConversationRead(friendId: string): void {
  delete messengerUnreadState.directMessages[friendId]
}

export function clearMessengerUnread(): void {
  for (const workspaceId of Object.keys(messengerUnreadState.workspaces)) {
    delete messengerUnreadState.workspaces[workspaceId]
  }
  for (const friendId of Object.keys(messengerUnreadState.directMessages)) {
    delete messengerUnreadState.directMessages[friendId]
  }
}

export function pruneMessengerUnreadRooms(
  workspaceIds: readonly string[],
  friendIds: readonly string[],
): void {
  const availableWorkspaces = new Set(workspaceIds)
  const availableFriends = new Set(friendIds)
  for (const workspaceId of Object.keys(messengerUnreadState.workspaces)) {
    if (!availableWorkspaces.has(workspaceId)) {
      delete messengerUnreadState.workspaces[workspaceId]
    }
  }
  for (const friendId of Object.keys(messengerUnreadState.directMessages)) {
    if (!availableFriends.has(friendId)) {
      delete messengerUnreadState.directMessages[friendId]
    }
  }
}

function isVisibleRoom(
  visibleRoom: VisibleMessengerRoom | null,
  kind: VisibleMessengerRoom['kind'],
  id: string,
): boolean {
  return visibleRoom?.kind === kind && visibleRoom.id === id
}

function recordWorkspaceUnread(
  workspaceId: string,
  visibleRoom: VisibleMessengerRoom | null,
): boolean {
  if (isVisibleRoom(visibleRoom, 'workspace', workspaceId)) return false
  messengerUnreadState.workspaces[workspaceId] = workspaceUnreadCount(workspaceId) + 1
  return true
}

export function receiveWorkspaceMessageUnread(
  message: WorkspaceMessage,
  currentUserId: string | null,
  visibleRoom: VisibleMessengerRoom | null,
): boolean {
  if (!currentUserId || message.author.user_id === currentUserId) return false
  return recordWorkspaceUnread(message.workspace_id, visibleRoom)
}

export function receiveDirectMessageUnread(
  message: DirectMessage,
  currentUserId: string | null,
  visibleRoom: VisibleMessengerRoom | null,
): boolean {
  if (
    !currentUserId ||
    message.author.user_id === currentUserId ||
    message.recipient.user_id !== currentUserId
  ) {
    return false
  }

  const friendId = message.author.user_id
  if (isVisibleRoom(visibleRoom, 'dm', friendId)) return false
  messengerUnreadState.directMessages[friendId] = directMessageUnreadCount(friendId) + 1
  return true
}

export function receiveWorkspaceActivityUnread(
  event: NotificationEvent,
  currentUserId: string | null,
  visibleRoom: VisibleMessengerRoom | null,
): boolean {
  if (!currentUserId || event.actor.user_id === currentUserId) return false
  return recordWorkspaceUnread(event.workspace_id, visibleRoom)
}

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
    (actor.profile_image_url !== null && typeof actor.profile_image_url !== 'string')
  ) {
    return null
  }
  return candidate as NotificationEvent
}
