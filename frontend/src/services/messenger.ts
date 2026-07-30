import { reactive } from 'vue'
import type { List } from '../types'

export type MessengerPane = 'friends' | 'chat'
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
  workspace: MessengerWorkspace | null
  cardDrag: { cardId: string; source: CardDragSource } | null
  chatDropConsumedCardId: string | null
  inboxDestinations: InboxDestination[]
  inboxRefreshToken: number
  boardRefreshToken: number
}>({
  open: false,
  pane: 'friends',
  workspace: null,
  cardDrag: null,
  chatDropConsumedCardId: null,
  inboxDestinations: [],
  inboxRefreshToken: 0,
  boardRefreshToken: 0,
})

export function openMessenger(pane: MessengerPane = messengerState.pane): void {
  if (pane === 'chat' && !messengerState.workspace) return
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

export function setMessengerWorkspace(workspace: MessengerWorkspace): void {
  messengerState.workspace = { ...workspace }
}

export function clearMessengerWorkspace(workspaceId?: string): void {
  if (
    workspaceId &&
    messengerState.workspace &&
    messengerState.workspace.id !== workspaceId
  ) {
    return
  }
  messengerState.workspace = null
  if (messengerState.pane === 'chat') messengerState.pane = 'friends'
}

export function resetMessenger(): void {
  messengerState.open = false
  messengerState.pane = 'friends'
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
