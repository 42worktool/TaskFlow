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
  messengerState.workspace = { ...workspace }
  if (
    messengerState.activeRoom?.kind === 'workspace' &&
    messengerState.activeRoom.workspace.id === workspace.id
  ) {
    messengerState.activeRoom.workspace = { ...workspace }
  }
}

export function clearMessengerWorkspace(workspaceId?: string): void {
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
  messengerState.externalCardDrop = null
  messengerState.pendingChatCardAttachment = null
  messengerState.cardDrag = { cardId, source }
}

export function finishCardDrag(): void {
  messengerState.cardDrag = null
}

function matchesActiveBoardDrag(cardId: string): boolean {
  return messengerState.cardDrag?.source === 'board' && messengerState.cardDrag.cardId === cardId
}

export function setExternalCardDropHover(
  cardId: string,
  target: ExternalCardDropTarget,
  owner: ExternalCardDropOwner,
): boolean {
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
  messengerState.inboxRefreshToken += 1
}

export function notifyBoardChanged(): void {
  messengerState.boardRefreshToken += 1
}
