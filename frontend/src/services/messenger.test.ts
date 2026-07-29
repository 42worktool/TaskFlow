import { afterEach, describe, expect, it } from 'vitest'
import {
  clearInboxDestinations,
  clearMessengerWorkspace,
  closeMessenger,
  finishCardDrag,
  messengerState,
  notifyBoardChanged,
  notifyInboxChanged,
  openMessenger,
  resetMessenger,
  setInboxDestinations,
  setMessengerWorkspace,
  startCardDrag,
  toggleMessenger,
} from './messenger'

describe('messenger state', () => {
  afterEach(() => {
    finishCardDrag()
    closeMessenger()
    clearInboxDestinations()
    clearMessengerWorkspace()
  })

  it('opens one pane at a time and toggles the current pane closed', () => {
    openMessenger('friends')
    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('friends')

    toggleMessenger('inbox')
    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('inbox')

    toggleMessenger('inbox')
    expect(messengerState.open).toBe(false)
  })

  it('only opens chat while an accessible workspace is active', () => {
    openMessenger('chat')
    expect(messengerState.open).toBe(false)

    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 2 })
    openMessenger('chat')
    expect(messengerState.pane).toBe('chat')
    expect(messengerState.open).toBe(true)

    clearMessengerWorkspace('another-workspace')
    expect(messengerState.workspace?.id).toBe('workspace-1')

    clearMessengerWorkspace('workspace-1')
    expect(messengerState.workspace).toBeNull()
    expect(messengerState.pane).toBe('friends')
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

  it('keeps the inbox pane selected while tracking its drag source', () => {
    openMessenger('inbox')
    startCardDrag('card-1', 'inbox')

    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('inbox')
    expect(messengerState.cardDrag).toEqual({
      cardId: 'card-1',
      source: 'inbox',
    })

    finishCardDrag()
    expect(messengerState.cardDrag).toBeNull()
  })

  it('resets session-scoped messenger context', () => {
    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 1 })
    setInboxDestinations([{ id: 'list-1', name: 'Todo' }])
    openMessenger('inbox')
    startCardDrag('card-1', 'board')

    resetMessenger()

    expect(messengerState.open).toBe(false)
    expect(messengerState.pane).toBe('friends')
    expect(messengerState.workspace).toBeNull()
    expect(messengerState.cardDrag).toBeNull()
    expect(messengerState.inboxDestinations).toEqual([])
  })
})
