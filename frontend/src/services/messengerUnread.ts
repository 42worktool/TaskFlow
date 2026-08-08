// 실시간 메시지·친구 요청·워크스페이스 활동을 메신저 배지 하나로 집계한다.
// 읽음 상태는 서버 영속 알림이 아니라 현재 브라우저 세션의 UI 관심 상태를 나타낸다.
import { computed, reactive } from 'vue'
import type { DirectMessage, FriendRequest, NotificationEvent, WorkspaceMessage } from '../types'

export interface VisibleMessengerRoom {
  kind: 'workspace' | 'dm'
  id: string
}

const messengerUnreadState = reactive({
  workspaces: {} as Record<string, number>,
  directMessages: {} as Record<string, number>,
  friendRequests: 0,
})

export const totalMessengerUnreadCount = computed(
  () =>
    Object.values(messengerUnreadState.workspaces).reduce((total, count) => total + count, 0) +
    Object.values(messengerUnreadState.directMessages).reduce((total, count) => total + count, 0) +
    messengerUnreadState.friendRequests,
)
export const friendRequestUnreadCount = computed(() => messengerUnreadState.friendRequests)

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

export function markFriendRequestsRead(): void {
  messengerUnreadState.friendRequests = 0
}

export function clearMessengerUnread(): void {
  // reactive 객체 자체를 교체하지 않고 키를 지워 기존 computed 구독을 유지한다.
  for (const workspaceId of Object.keys(messengerUnreadState.workspaces)) {
    delete messengerUnreadState.workspaces[workspaceId]
  }
  for (const friendId of Object.keys(messengerUnreadState.directMessages)) {
    delete messengerUnreadState.directMessages[friendId]
  }
  markFriendRequestsRead()
}

export function pruneMessengerUnreadRooms(
  workspaceIds: readonly string[],
  friendIds: readonly string[],
): void {
  // 탈퇴한 워크스페이스나 해제된 친구의 배지가 총합에 영구히 남지 않도록 정리한다.
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
  // 사용자가 현재 보고 있는 방의 이벤트는 이미 읽은 것으로 간주해 배지를 올리지 않는다.
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
  // 내 송신 메시지와 다른 수신자에게 간 메시지는 현재 사용자의 알림이 아니다.
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

export function receiveFriendRequestUnread(
  request: FriendRequest,
  currentUserId: string | null,
  friendManagementVisible: boolean,
): boolean {
  if (!currentUserId || request.id === currentUserId || friendManagementVisible) return false
  messengerUnreadState.friendRequests += 1
  return true
}

export function parseNotificationEvent(value: unknown): NotificationEvent | null {
  // WebSocket 경계의 unknown 값을 화면 타입으로 신뢰하기 전에 필수 필드를 런타임 검증한다.
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
