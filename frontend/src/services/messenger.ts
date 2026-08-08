// 워크스페이스 채팅·DM·친구 관리 패널과 카드 외부 드롭을 연결하는 전역 UI 상태다.
// 라우트와 여러 패널이 같은 메신저를 조작하므로 컴포넌트 로컬 상태 대신 이 모듈이 조정한다.
import { reactive } from 'vue'
import type { Friend, List } from '../types'
import {
  clearMessengerUnread,
  markDirectConversationRead,
  markFriendRequestsRead,
  markWorkspaceConversationRead,
} from './messengerUnread'

export type MessengerPane = 'directory' | 'friends' | 'chat' | 'dm'
export type CardDragSource = 'board' | 'inbox'
export type ExternalCardDropTarget = 'chat' | 'inbox'
export type ExternalCardDropOwner = 'chat-panel' | 'toolbox-chat' | 'toolbox-inbox'
export type InboxDestination = Pick<List, 'id' | 'name'>
export interface FloatingPosition {
  x: number
  y: number
}
export interface FloatingSize {
  width: number
  height: number
}
export interface MessengerWorkspace {
  id: string
  name: string
  syncVersion: number
}
export type MessengerRoom =
  | {
      kind: 'workspace'
      workspace: MessengerWorkspace
    }
  | {
      kind: 'dm'
      friend: Pick<Friend, 'id' | 'name' | 'profile_image_url' | 'online'>
    }

export interface ExternalCardDrop {
  cardId: string
  target: ExternalCardDropTarget
  owner: ExternalCardDropOwner
  committed: boolean
}

export interface PendingChatCardAttachment {
  workspaceId: string
  cardId: string
}

const MESSENGER_DRAG_THRESHOLD = 6
const MESSENGER_VIEWPORT_MARGIN = 8

export function clampFloatingPosition(
  position: FloatingPosition,
  element: FloatingSize,
  viewport: FloatingSize,
  margin = MESSENGER_VIEWPORT_MARGIN,
): FloatingPosition {
  // 드래그한 창이 화면 밖으로 사라져 다시 잡을 수 없게 되는 상황을 여백 안으로 보정한다.
  const maxX = Math.max(margin, viewport.width - element.width - margin)
  const maxY = Math.max(margin, viewport.height - element.height - margin)

  return {
    x: Math.min(Math.max(position.x, margin), maxX),
    y: Math.min(Math.max(position.y, margin), maxY),
  }
}

export function exceedsDragThreshold(
  start: FloatingPosition,
  current: FloatingPosition,
  threshold = MESSENGER_DRAG_THRESHOLD,
): boolean {
  // 작은 포인터 흔들림은 클릭으로 남겨 대화방 선택과 창 이동이 서로 오인되지 않게 한다.
  const deltaX = current.x - start.x
  const deltaY = current.y - start.y
  return deltaX * deltaX + deltaY * deltaY >= threshold * threshold
}

export const messengerState = reactive<{
  open: boolean
  directoryCollapsed: boolean
  pane: MessengerPane
  activeRoom: MessengerRoom | null
  workspace: MessengerWorkspace | null
  cardDrag: { cardId: string; source: CardDragSource } | null
  externalCardDrop: ExternalCardDrop | null
  pendingChatCardAttachment: PendingChatCardAttachment | null
  inboxDestinations: InboxDestination[]
  inboxRefreshToken: number
  boardRefreshToken: number
}>({
  open: false,
  directoryCollapsed: false,
  pane: 'directory',
  activeRoom: null,
  workspace: null,
  cardDrag: null,
  externalCardDrop: null,
  pendingChatCardAttachment: null,
  inboxDestinations: [],
  inboxRefreshToken: 0,
  boardRefreshToken: 0,
})

export function openMessenger(pane: MessengerPane = messengerState.pane): void {
  // 채팅/DM은 실제 대상 방이 있을 때만 열어 내용 없는 대화 화면이 생기지 않게 한다.
  if (pane === 'chat') {
    if (messengerState.activeRoom?.kind !== 'workspace') {
      if (!messengerState.workspace) return
      messengerState.activeRoom = {
        kind: 'workspace',
        workspace: { ...messengerState.workspace },
      }
    }
  }
  if (pane === 'dm' && messengerState.activeRoom?.kind !== 'dm') return
  messengerState.pane = pane
  messengerState.open = true
  if (pane === 'chat' && messengerState.activeRoom?.kind === 'workspace') {
    markWorkspaceConversationRead(messengerState.activeRoom.workspace.id)
  }
  if (pane === 'dm' && messengerState.activeRoom?.kind === 'dm') {
    markDirectConversationRead(messengerState.activeRoom.friend.id)
  }
  if (pane === 'friends') markFriendRequestsRead()
}

export function toggleMessenger(pane: MessengerPane = messengerState.pane): void {
  if (messengerState.open && messengerState.pane === pane) {
    messengerState.open = false
    return
  }
  openMessenger(pane)
}

export function closeMessenger(): void {
  messengerState.open = false
}

export function toggleMessengerDirectory(): void {
  messengerState.directoryCollapsed = !messengerState.directoryCollapsed
}

export function showMessengerDirectory(): void {
  messengerState.pane = 'directory'
  messengerState.open = true
}

export function showFriendManagement(): void {
  messengerState.pane = 'friends'
  messengerState.open = true
  markFriendRequestsRead()
}

export function openWorkspaceConversation(workspace: MessengerWorkspace): void {
  messengerState.activeRoom = {
    kind: 'workspace',
    workspace: { ...workspace },
  }
  messengerState.pane = 'chat'
  messengerState.open = true
  markWorkspaceConversationRead(workspace.id)
}

export function openDirectConversation(
  friend: Pick<Friend, 'id' | 'name' | 'profile_image_url' | 'online'>,
): void {
  messengerState.activeRoom = {
    kind: 'dm',
    friend: { ...friend },
  }
  messengerState.pane = 'dm'
  messengerState.open = true
  markDirectConversationRead(friend.id)
}

export function setMessengerWorkspace(workspace: MessengerWorkspace): void {
  // 현재 라우트의 워크스페이스와 이미 열린 방을 함께 갱신해 이름·syncVersion이 엇갈리지 않게 한다.
  messengerState.workspace = { ...workspace }
  if (
    messengerState.activeRoom?.kind === 'workspace' &&
    messengerState.activeRoom.workspace.id === workspace.id
  ) {
    messengerState.activeRoom.workspace = { ...workspace }
  }
}

export function clearMessengerWorkspace(workspaceId?: string): void {
  // 늦게 unmount된 이전 화면이 새 워크스페이스 상태를 지우지 못하도록 ID가 다르면 무시한다.
  if (workspaceId && messengerState.workspace && messengerState.workspace.id !== workspaceId) {
    return
  }
  const clearedWorkspaceId = messengerState.workspace?.id ?? workspaceId
  messengerState.workspace = null
  if (messengerState.pendingChatCardAttachment?.workspaceId === clearedWorkspaceId) {
    messengerState.pendingChatCardAttachment = null
  }
  if (
    messengerState.activeRoom?.kind === 'workspace' &&
    (!clearedWorkspaceId || messengerState.activeRoom.workspace.id === clearedWorkspaceId)
  ) {
    messengerState.activeRoom = null
    if (messengerState.pane === 'chat') messengerState.pane = 'directory'
  }
}

export function resetMessenger(): void {
  messengerState.open = false
  messengerState.directoryCollapsed = false
  messengerState.pane = 'directory'
  messengerState.activeRoom = null
  messengerState.workspace = null
  messengerState.cardDrag = null
  messengerState.externalCardDrop = null
  messengerState.pendingChatCardAttachment = null
  messengerState.inboxDestinations = []
  clearMessengerUnread()
}

export function startCardDrag(cardId: string, source: CardDragSource): void {
  // 한 번의 드래그마다 이전 hover/첨부 의도를 비워 드롭 소유권이 다음 카드로 새지 않게 한다.
  messengerState.externalCardDrop = null
  messengerState.pendingChatCardAttachment = null
  messengerState.cardDrag = { cardId, source }
}

export function finishCardDrag(): void {
  messengerState.cardDrag = null
}

function matchesActiveBoardDrag(cardId: string): boolean {
  // 인박스에서 꺼내는 드래그는 리스트 배치 전용이며 채팅/인박스 외부 드롭과 경쟁시키지 않는다.
  return messengerState.cardDrag?.source === 'board' && messengerState.cardDrag.cardId === cardId
}

export function setExternalCardDropHover(
  cardId: string,
  target: ExternalCardDropTarget,
  owner: ExternalCardDropOwner,
): boolean {
  // 툴박스와 열린 패널이 겹쳐도 아직 commit되지 않은 동일 드래그만 hover를 선점할 수 있다.
  if (!matchesActiveBoardDrag(cardId)) return false
  if (messengerState.externalCardDrop?.committed) return false
  messengerState.externalCardDrop = {
    cardId,
    target,
    owner,
    committed: false,
  }
  return true
}

export function clearExternalCardDropHover(cardId: string, owner: ExternalCardDropOwner): void {
  const drop = messengerState.externalCardDrop
  if (!drop || drop.committed || drop.cardId !== cardId || drop.owner !== owner) {
    return
  }
  messengerState.externalCardDrop = null
}

export function claimExternalCardDrop(
  cardId: string,
  target: ExternalCardDropTarget,
  owner: ExternalCardDropOwner,
): boolean {
  // 드롭을 원자적으로 확정해 뒤의 보드 리스트가 같은 카드를 다시 처리하는 것을 막는다.
  if (!matchesActiveBoardDrag(cardId)) return false
  if (messengerState.externalCardDrop?.committed) return false
  messengerState.externalCardDrop = {
    cardId,
    target,
    owner,
    committed: true,
  }
  return true
}

export function isExternalCardDropClaimed(cardId: string): boolean {
  // hover 중인 대상도 원본 보드가 먼저 저장하지 않게 claimed로 본다.
  // 최종 확정 여부는 externalCardDrop.committed가 별도로 구분한다.
  return messengerState.externalCardDrop?.cardId === cardId
}

export function clearExternalCardDrop(cardId?: string): void {
  if (cardId !== undefined && messengerState.externalCardDrop?.cardId !== cardId) {
    return
  }
  messengerState.externalCardDrop = null
}

export function requestChatCardAttachment(
  cardId: string,
  owner: Extract<ExternalCardDropOwner, 'chat-panel' | 'toolbox-chat'>,
): boolean {
  // 닫힌 채팅 아이콘에 드롭해도 해당 워크스페이스 방을 열고 입력창에 카드 첨부 의도를 전달한다.
  const workspace = messengerState.workspace
  if (!workspace || !claimExternalCardDrop(cardId, 'chat', owner)) {
    return false
  }

  messengerState.pendingChatCardAttachment = {
    workspaceId: workspace.id,
    cardId,
  }
  messengerState.activeRoom = {
    kind: 'workspace',
    workspace: { ...workspace },
  }
  messengerState.pane = 'chat'
  messengerState.open = true
  markWorkspaceConversationRead(workspace.id)
  return true
}

export function takePendingChatCardAttachment(workspaceId: string): string | null {
  // 입력 컴포넌트가 한 번 소비하면 지워 같은 카드가 재마운트 때 다시 첨부되지 않게 한다.
  const pending = messengerState.pendingChatCardAttachment
  if (!pending || pending.workspaceId !== workspaceId) return null
  messengerState.pendingChatCardAttachment = null
  return pending.cardId
}

export function setInboxDestinations(destinations: readonly InboxDestination[]): void {
  messengerState.inboxDestinations = destinations.map((list) => ({
    id: list.id,
    name: list.name,
  }))
}

export function clearInboxDestinations(): void {
  messengerState.inboxDestinations = []
}

export function notifyInboxChanged(): void {
  // 서로 직접 참조하지 않는 패널들이 토큰 증가를 감지해 필요한 목록만 다시 가져온다.
  messengerState.inboxRefreshToken += 1
}

export function notifyBoardChanged(): void {
  messengerState.boardRefreshToken += 1
}
