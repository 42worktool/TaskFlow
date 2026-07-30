import { afterEach, describe, expect, it } from 'vitest'
import {
  clampFloatingPosition,
  clearChatCardDrop,
  clearInboxDestinations,
  clearMessengerWorkspace,
  consumeChatCardDrop,
  exceedsDragThreshold,
  finishCardDrag,
  markCardDragConsumedByChat,
  messengerState,
  notifyBoardChanged,
  notifyInboxChanged,
  openDirectConversation,
  openMessenger,
  openWorkspaceConversation,
  resetMessenger,
  setInboxDestinations,
  setMessengerWorkspace,
  showFriendManagement,
  showMessengerDirectory,
  startCardDrag,
  toggleMessenger,
} from './messenger'

describe('messenger state', () => {
  afterEach(() => {
    finishCardDrag()
    clearChatCardDrop()
    clearInboxDestinations()
    resetMessenger()
  })

  it('opens one pane at a time and toggles the current pane closed', () => {
    showFriendManagement()
    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('friends')

    openWorkspaceConversation({
      id: 'workspace-1',
      name: 'Alpha',
      syncVersion: 2,
    })
    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('chat')

    toggleMessenger('chat')
    expect(messengerState.open).toBe(false)
  })

  it('opens the current route workspace when chat has no selected room', () => {
    openMessenger('chat')
    expect(messengerState.open).toBe(false)

    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 2 })
    openMessenger('chat')
    expect(messengerState.pane).toBe('chat')
    expect(messengerState.open).toBe(true)
    expect(messengerState.activeRoom).toEqual({
      kind: 'workspace',
      workspace: { id: 'workspace-1', name: 'Alpha', syncVersion: 2 },
    })

    clearMessengerWorkspace('another-workspace')
    expect(messengerState.workspace?.id).toBe('workspace-1')

    clearMessengerWorkspace('workspace-1')
    expect(messengerState.workspace).toBeNull()
    expect(messengerState.activeRoom).toBeNull()
    expect(messengerState.pane).toBe('directory')
  })

  it('keeps direct messages independent from route workspace context', () => {
    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 1 })
    openDirectConversation({
      id: 'friend-1',
      name: 'Jamie',
      profile_image_url: null,
      online: true,
    })

    clearMessengerWorkspace('workspace-1')

    expect(messengerState.workspace).toBeNull()
    expect(messengerState.pane).toBe('dm')
    expect(messengerState.activeRoom).toEqual({
      kind: 'dm',
      friend: {
        id: 'friend-1',
        name: 'Jamie',
        profile_image_url: null,
        online: true,
      },
    })
  })

  it('returns to the directory without discarding the selected conversation', () => {
    openDirectConversation({
      id: 'friend-1',
      name: 'Jamie',
      profile_image_url: null,
      online: false,
    })

    showMessengerDirectory()

    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('directory')
    expect(messengerState.activeRoom?.kind).toBe('dm')
  })

  it('shares only the small inbox context needed by the active board', () => {
    const inboxToken = messengerState.inboxRefreshToken
    const boardToken = messengerState.boardRefreshToken

    setInboxDestinations([{ id: 'list-1', name: 'Todo' }])
    notifyInboxChanged()
    notifyBoardChanged()

    expect(messengerState.inboxDestinations).toEqual([
      { id: 'list-1', name: 'Todo' },
    ])
    expect(messengerState.inboxRefreshToken).toBe(inboxToken + 1)
    expect(messengerState.boardRefreshToken).toBe(boardToken + 1)
  })

  it('tracks inbox card dragging without coupling it to a messenger pane', () => {
    showFriendManagement()
    startCardDrag('card-1', 'inbox')

    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('friends')
    expect(messengerState.cardDrag).toEqual({
      cardId: 'card-1',
      source: 'inbox',
    })

    finishCardDrag()
    expect(messengerState.cardDrag).toBeNull()
  })

  it('keeps a consumed chat drop until the board change handler restores it', () => {
    startCardDrag('card-1', 'board')
    markCardDragConsumedByChat('card-1')
    finishCardDrag()

    expect(messengerState.chatDropConsumedCardId).toBe('card-1')
    expect(consumeChatCardDrop('another-card')).toBe(false)
    expect(consumeChatCardDrop('card-1')).toBe(true)
    expect(consumeChatCardDrop('card-1')).toBe(false)
    expect(messengerState.chatDropConsumedCardId).toBeNull()
  })

  it('does not mark inbox or mismatched card drags as chat drops', () => {
    startCardDrag('card-1', 'inbox')
    markCardDragConsumedByChat('card-1')
    expect(messengerState.chatDropConsumedCardId).toBeNull()

    startCardDrag('card-1', 'board')
    markCardDragConsumedByChat('card-2')
    expect(messengerState.chatDropConsumedCardId).toBeNull()
  })

  it('resets session-scoped messenger context', () => {
    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 1 })
    setInboxDestinations([{ id: 'list-1', name: 'Todo' }])
    openMessenger('chat')
    startCardDrag('card-1', 'board')

    resetMessenger()

    expect(messengerState.open).toBe(false)
    expect(messengerState.pane).toBe('directory')
    expect(messengerState.activeRoom).toBeNull()
    expect(messengerState.workspace).toBeNull()
    expect(messengerState.cardDrag).toBeNull()
    expect(messengerState.chatDropConsumedCardId).toBeNull()
    expect(messengerState.inboxDestinations).toEqual([])
  })
})

describe('floating messenger geometry', () => {
  it('clamps an element to every viewport edge', () => {
    const size = { width: 420, height: 640 }
    const viewport = { width: 1200, height: 900 }

    expect(
      clampFloatingPosition({ x: -100, y: -50 }, size, viewport),
    ).toEqual({ x: 8, y: 8 })
    expect(
      clampFloatingPosition({ x: 1100, y: 800 }, size, viewport),
    ).toEqual({ x: 772, y: 252 })
  })

  it('keeps an oversized element anchored to the viewport margin', () => {
    expect(
      clampFloatingPosition(
        { x: 100, y: 100 },
        { width: 500, height: 500 },
        { width: 400, height: 400 },
      ),
    ).toEqual({ x: 8, y: 8 })
  })

  it('distinguishes a click from a pointer drag', () => {
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(
      false,
    )
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(
      true,
    )
  })
})
