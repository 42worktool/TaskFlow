// 메신저 패널 상태와 읽지 않은 메시지의 격리, 영역 간 카드 드래그를 검증한다.
import { afterEach, describe, expect, it } from 'vitest'
import {
  clampFloatingPosition,
  claimExternalCardDrop,
  clearExternalCardDrop,
  clearExternalCardDropHover,
  clearInboxDestinations,
  clearMessengerWorkspace,
  exceedsDragThreshold,
  finishCardDrag,
  isExternalCardDropClaimed,
  messengerState,
  notifyBoardChanged,
  notifyInboxChanged,
  openDirectConversation,
  openMessenger,
  openWorkspaceConversation,
  requestChatCardAttachment,
  resetMessenger,
  setInboxDestinations,
  setMessengerWorkspace,
  showFriendManagement,
  showMessengerDirectory,
  startCardDrag,
  setExternalCardDropHover,
  takePendingChatCardAttachment,
  toggleMessengerDirectory,
  toggleMessenger,
} from '../../src/services/messenger'
import {
  directMessageUnreadCount,
  friendRequestUnreadCount,
  receiveDirectMessageUnread,
  receiveFriendRequestUnread,
  receiveWorkspaceMessageUnread,
  workspaceUnreadCount,
} from '../../src/services/messengerUnread'

describe('messenger state', () => {
  afterEach(() => {
    finishCardDrag()
    clearExternalCardDrop()
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

  it('marks only the conversation being opened as read', () => {
    receiveWorkspaceMessageUnread(
      {
        id: 'workspace-message-1',
        workspace_id: 'workspace-1',
        card_id: null,
        content: 'workspace hello',
        created_at: '2026-07-30T00:00:00.000Z',
        author: {
          user_id: 'member-1',
          name: 'Member',
          profile_image_url: null,
        },
      },
      'current-user',
      null,
    )
    receiveDirectMessageUnread(
      {
        id: 'direct-message-1',
        content: 'dm hello',
        created_at: '2026-07-30T00:00:00.000Z',
        author: {
          user_id: 'friend-1',
          name: 'Jamie',
          profile_image_url: null,
        },
        recipient: {
          user_id: 'current-user',
          name: 'Current user',
          profile_image_url: null,
        },
      },
      'current-user',
      null,
    )

    openWorkspaceConversation({
      id: 'workspace-1',
      name: 'Alpha',
      syncVersion: 1,
    })
    expect(workspaceUnreadCount('workspace-1')).toBe(0)
    expect(directMessageUnreadCount('friend-1')).toBe(1)

    openDirectConversation({
      id: 'friend-1',
      name: 'Jamie',
      profile_image_url: null,
      online: false,
    })
    expect(directMessageUnreadCount('friend-1')).toBe(0)
  })

  it('marks friend requests read whenever friend management is opened', () => {
    const request = {
      id: 'friend-1',
      name: 'Jamie',
      profile_image_url: null,
      requested_at: '2026-07-30T00:00:00.000Z',
    }

    receiveFriendRequestUnread(request, 'current-user', false)
    showFriendManagement()
    expect(friendRequestUnreadCount.value).toBe(0)

    receiveFriendRequestUnread(request, 'current-user', false)
    openMessenger('friends')
    expect(friendRequestUnreadCount.value).toBe(0)
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

  it('collapses and restores the desktop directory rail', () => {
    expect(messengerState.directoryCollapsed).toBe(false)

    toggleMessengerDirectory()
    expect(messengerState.directoryCollapsed).toBe(true)

    toggleMessengerDirectory()
    expect(messengerState.directoryCollapsed).toBe(false)
  })

  it('shares only the small inbox context needed by the active board', () => {
    const inboxToken = messengerState.inboxRefreshToken
    const boardToken = messengerState.boardRefreshToken

    setInboxDestinations([{ id: 'list-1', name: 'Todo' }])
    notifyInboxChanged()
    notifyBoardChanged()

    expect(messengerState.inboxDestinations).toEqual([{ id: 'list-1', name: 'Todo' }])
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

  it('tracks external hover by owner and clears only the matching hover', () => {
    startCardDrag('card-1', 'board')

    expect(setExternalCardDropHover('card-1', 'chat', 'chat-panel')).toBe(true)
    expect(isExternalCardDropClaimed('card-1')).toBe(true)

    // 인접한 드롭 영역이 채팅 패널에서 활성화한 드롭 대상을 해제하면 안 된다.
    clearExternalCardDropHover('card-1', 'toolbox-chat')
    expect(isExternalCardDropClaimed('card-1')).toBe(true)

    clearExternalCardDropHover('card-1', 'chat-panel')
    expect(isExternalCardDropClaimed('card-1')).toBe(false)
  })

  it('keeps a committed chat drop and one-shot attachment after drag end', () => {
    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 1 })
    startCardDrag('card-1', 'board')

    expect(requestChatCardAttachment('card-1', 'toolbox-chat')).toBe(true)
    // 포인터 정리로 드래그는 끝나지만, 확정된 카드 데이터는 입력창에서 소비할 때까지 유지해야 한다.
    finishCardDrag()

    expect(messengerState.externalCardDrop).toEqual({
      cardId: 'card-1',
      target: 'chat',
      owner: 'toolbox-chat',
      committed: true,
    })
    expect(messengerState.open).toBe(true)
    expect(messengerState.pane).toBe('chat')
    // 첨부 카드는 선택한 워크스페이스에서만 정확히 한 번 소비해야 한다.
    expect(takePendingChatCardAttachment('workspace-2')).toBeNull()
    expect(takePendingChatCardAttachment('workspace-1')).toBe('card-1')
    expect(takePendingChatCardAttachment('workspace-1')).toBeNull()
  })

  it('does not rearm an attachment after the drag was already committed', () => {
    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 1 })
    startCardDrag('card-1', 'board')

    expect(requestChatCardAttachment('card-1', 'chat-panel')).toBe(true)
    expect(takePendingChatCardAttachment('workspace-1')).toBe('card-1')
    expect(requestChatCardAttachment('card-1', 'chat-panel')).toBe(false)
    expect(messengerState.pendingChatCardAttachment).toBeNull()
  })

  it('does not claim inbox or mismatched card drags as external drops', () => {
    startCardDrag('card-1', 'inbox')
    expect(setExternalCardDropHover('card-1', 'chat', 'chat-panel')).toBe(false)
    expect(claimExternalCardDrop('card-1', 'inbox', 'toolbox-inbox')).toBe(false)

    startCardDrag('card-1', 'board')
    expect(claimExternalCardDrop('card-2', 'chat', 'toolbox-chat')).toBe(false)
    expect(messengerState.externalCardDrop).toBeNull()
  })

  it('clears stale external state when a new card drag starts', () => {
    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 1 })
    startCardDrag('card-1', 'board')
    requestChatCardAttachment('card-1', 'toolbox-chat')

    // 새 드래그를 시작하면 이전 카드에 남아 있던 모든 드롭 대기를 무효화해야 한다.
    startCardDrag('card-2', 'board')

    expect(messengerState.externalCardDrop).toBeNull()
    expect(messengerState.pendingChatCardAttachment).toBeNull()
  })

  it('resets session-scoped messenger context', () => {
    setMessengerWorkspace({ id: 'workspace-1', name: 'Alpha', syncVersion: 1 })
    setInboxDestinations([{ id: 'list-1', name: 'Todo' }])
    openMessenger('chat')
    startCardDrag('card-1', 'board')

    resetMessenger()

    expect(messengerState.open).toBe(false)
    expect(messengerState.directoryCollapsed).toBe(false)
    expect(messengerState.pane).toBe('directory')
    expect(messengerState.activeRoom).toBeNull()
    expect(messengerState.workspace).toBeNull()
    expect(messengerState.cardDrag).toBeNull()
    expect(messengerState.externalCardDrop).toBeNull()
    expect(messengerState.pendingChatCardAttachment).toBeNull()
    expect(messengerState.inboxDestinations).toEqual([])
  })
})

describe('floating messenger geometry', () => {
  it('clamps an element to every viewport edge', () => {
    const size = { width: 420, height: 640 }
    const viewport = { width: 1200, height: 900 }

    expect(clampFloatingPosition({ x: -100, y: -50 }, size, viewport)).toEqual({ x: 8, y: 8 })
    expect(clampFloatingPosition({ x: 1100, y: 800 }, size, viewport)).toEqual({ x: 772, y: 252 })
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
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(false)
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true)
  })
})
