import { reactive } from 'vue'
import type { Friend, List } from '../types'

export type MessengerPane = 'directory' | 'friends' | 'chat' | 'dm'
export type CardDragSource = 'board' | 'inbox'
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

export const MESSENGER_DRAG_THRESHOLD = 6
export const MESSENGER_VIEWPORT_MARGIN = 8

export function clampFloatingPosition(
  position: FloatingPosition,
  element: FloatingSize,
  viewport: FloatingSize,
  margin = MESSENGER_VIEWPORT_MARGIN,
): FloatingPosition {
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
  const deltaX = current.x - start.x
  const deltaY = current.y - start.y
  return deltaX * deltaX + deltaY * deltaY >= threshold * threshold
}

export const messengerState = reactive<{
  open: boolean
  pane: MessengerPane
  activeRoom: MessengerRoom | null
  workspace: MessengerWorkspace | null
  cardDrag: { cardId: string; source: CardDragSource } | null
  chatDropConsumedCardId: string | null
  inboxDestinations: InboxDestination[]
  inboxRefreshToken: number
  boardRefreshToken: number
}>({
  open: false,
  pane: 'directory',
  activeRoom: null,
  workspace: null,
  cardDrag: null,
  chatDropConsumedCardId: null,
  inboxDestinations: [],
  inboxRefreshToken: 0,
  boardRefreshToken: 0,
})

export function openMessenger(pane: MessengerPane = messengerState.pane): void {
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

export function showMessengerDirectory(): void {
  messengerState.pane = 'directory'
  messengerState.open = true
}

export function showFriendManagement(): void {
  messengerState.pane = 'friends'
  messengerState.open = true
}

export function openWorkspaceConversation(
  workspace: MessengerWorkspace,
): void {
  messengerState.activeRoom = {
    kind: 'workspace',
    workspace: { ...workspace },
  }
  messengerState.pane = 'chat'
  messengerState.open = true
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
}

export function setMessengerWorkspace(workspace: MessengerWorkspace): void {
  messengerState.workspace = { ...workspace }
  if (
    messengerState.activeRoom?.kind === 'workspace' &&
    messengerState.activeRoom.workspace.id === workspace.id
  ) {
    messengerState.activeRoom.workspace = { ...workspace }
  }
}

export function clearMessengerWorkspace(workspaceId?: string): void {
  if (
    workspaceId &&
    messengerState.workspace &&
    messengerState.workspace.id !== workspaceId
  ) {
    return
  }
  const clearedWorkspaceId = messengerState.workspace?.id ?? workspaceId
  messengerState.workspace = null
  if (
    messengerState.activeRoom?.kind === 'workspace' &&
    (!clearedWorkspaceId ||
      messengerState.activeRoom.workspace.id === clearedWorkspaceId)
  ) {
    messengerState.activeRoom = null
    if (messengerState.pane === 'chat') messengerState.pane = 'directory'
  }
}

export function resetMessenger(): void {
  messengerState.open = false
  messengerState.pane = 'directory'
  messengerState.activeRoom = null
  messengerState.workspace = null
  messengerState.cardDrag = null
  messengerState.chatDropConsumedCardId = null
  messengerState.inboxDestinations = []
}

export function startCardDrag(cardId: string, source: CardDragSource): void {
  messengerState.chatDropConsumedCardId = null
  messengerState.cardDrag = { cardId, source }
}

export function finishCardDrag(): void {
  messengerState.cardDrag = null
}

export function markCardDragConsumedByChat(cardId: string): void {
  if (
    messengerState.cardDrag?.source !== 'board' ||
    messengerState.cardDrag.cardId !== cardId
  ) {
    return
  }
  messengerState.chatDropConsumedCardId = cardId
}

export function consumeChatCardDrop(cardId: string): boolean {
  if (messengerState.chatDropConsumedCardId !== cardId) return false
  messengerState.chatDropConsumedCardId = null
  return true
}

export function clearChatCardDrop(cardId?: string): void {
  if (
    cardId !== undefined &&
    messengerState.chatDropConsumedCardId !== cardId
  ) {
    return
  }
  messengerState.chatDropConsumedCardId = null
}

export function setInboxDestinations(
  destinations: readonly InboxDestination[],
): void {
  messengerState.inboxDestinations = destinations.map((list) => ({
    id: list.id,
    name: list.name,
  }))
}

export function clearInboxDestinations(): void {
  messengerState.inboxDestinations = []
}

export function notifyInboxChanged(): void {
  messengerState.inboxRefreshToken += 1
}

export function notifyBoardChanged(): void {
  messengerState.boardRefreshToken += 1
}
