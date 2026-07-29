import { reactive } from 'vue'
import type { List } from '../types'

export type MessengerPane = 'friends' | 'inbox' | 'chat'
export type CardDragSource = 'board' | 'inbox'
export type InboxDestination = Pick<List, 'id' | 'name'>
export interface MessengerWorkspace {
  id: string
  name: string
  syncVersion: number
}

export const messengerState = reactive<{
  open: boolean
  pane: MessengerPane
  workspace: MessengerWorkspace | null
  cardDrag: { cardId: string; source: CardDragSource } | null
  inboxDestinations: InboxDestination[]
  inboxRefreshToken: number
  boardRefreshToken: number
}>({
  open: false,
  pane: 'friends',
  workspace: null,
  cardDrag: null,
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
  messengerState.inboxDestinations = []
}

export function startCardDrag(cardId: string, source: CardDragSource): void {
  messengerState.cardDrag = { cardId, source }
}

export function finishCardDrag(): void {
  messengerState.cardDrag = null
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
