import { beforeEach, describe, expect, it } from 'vitest'
import type { DirectMessage, FriendRequest, NotificationEvent, WorkspaceMessage } from '../types'
import {
  clearMessengerUnread,
  directMessageUnreadCount,
  formatMessengerUnreadCount,
  friendRequestUnreadCount,
  markDirectConversationRead,
  markFriendRequestsRead,
  markWorkspaceConversationRead,
  parseNotificationEvent,
  pruneMessengerUnreadRooms,
  receiveDirectMessageUnread,
  receiveFriendRequestUnread,
  receiveWorkspaceActivityUnread,
  receiveWorkspaceMessageUnread,
  totalMessengerUnreadCount,
  workspaceUnreadCount,
} from './messengerUnread'

const CURRENT_USER_ID = '00000000-0000-4000-8000-000000000001'
const FRIEND_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_FRIEND_ID = '00000000-0000-4000-8000-000000000003'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000004'
const OTHER_WORKSPACE_ID = '00000000-0000-4000-8000-000000000005'

function directMessage(id: string, authorId = FRIEND_ID): DirectMessage {
  return {
    id,
    content: 'hello',
    created_at: '2026-07-30T00:00:00.000Z',
    author: {
      user_id: authorId,
      name: 'Friend',
      profile_image_url: null,
    },
    recipient: {
      user_id: CURRENT_USER_ID,
      name: 'Current user',
      profile_image_url: null,
    },
  }
}

function workspaceMessage(
  id: string,
  authorId = FRIEND_ID,
  workspaceId = WORKSPACE_ID,
): WorkspaceMessage {
  return {
    id,
    workspace_id: workspaceId,
    card_id: null,
    content: 'workspace hello',
    created_at: '2026-07-30T00:00:00.000Z',
    author: {
      user_id: authorId,
      name: 'Member',
      profile_image_url: null,
    },
  }
}

function workspaceActivity(id: string): NotificationEvent {
  return {
    id,
    category: 'UPDATE',
    kind: 'workspace.member_joined',
    text: '새 멤버가 참여했습니다.',
    created_at: '2026-07-30T00:00:00.000Z',
    workspace_id: WORKSPACE_ID,
    actor: {
      user_id: FRIEND_ID,
      name: 'Member',
      profile_image_url: null,
    },
  }
}

function friendRequest(id = FRIEND_ID): FriendRequest {
  return {
    id,
    name: 'Friend',
    profile_image_url: null,
    requested_at: '2026-07-30T00:00:00.000Z',
  }
}

describe('messenger unread state', () => {
  beforeEach(clearMessengerUnread)

  it('formats the visible badge at 99+', () => {
    expect(formatMessengerUnreadCount(0)).toBe('')
    expect(formatMessengerUnreadCount(1)).toBe('1')
    expect(formatMessengerUnreadCount(99)).toBe('99')
    expect(formatMessengerUnreadCount(100)).toBe('99+')
    expect(formatMessengerUnreadCount(250)).toBe('99+')
  })

  it('counts incoming direct messages by friend', () => {
    receiveDirectMessageUnread(
      directMessage('00000000-0000-4000-8000-000000000011'),
      CURRENT_USER_ID,
      null,
    )
    receiveDirectMessageUnread(
      directMessage('00000000-0000-4000-8000-000000000012', OTHER_FRIEND_ID),
      CURRENT_USER_ID,
      null,
    )
    expect(directMessageUnreadCount(FRIEND_ID)).toBe(1)
    expect(directMessageUnreadCount(OTHER_FRIEND_ID)).toBe(1)
    expect(totalMessengerUnreadCount.value).toBe(2)
  })

  it('does not count self-authored or currently visible messages', () => {
    const selfMessage = directMessage('00000000-0000-4000-8000-000000000013', CURRENT_USER_ID)
    selfMessage.recipient.user_id = FRIEND_ID

    expect(receiveDirectMessageUnread(selfMessage, CURRENT_USER_ID, null)).toBe(false)
    expect(
      receiveDirectMessageUnread(
        directMessage('00000000-0000-4000-8000-000000000014'),
        CURRENT_USER_ID,
        { kind: 'dm', id: FRIEND_ID },
      ),
    ).toBe(false)
    expect(
      receiveWorkspaceMessageUnread(
        workspaceMessage('00000000-0000-4000-8000-000000000015'),
        CURRENT_USER_ID,
        { kind: 'workspace', id: WORKSPACE_ID },
      ),
    ).toBe(false)
    expect(
      receiveWorkspaceMessageUnread(
        workspaceMessage('00000000-0000-4000-8000-000000000020', CURRENT_USER_ID),
        CURRENT_USER_ID,
        null,
      ),
    ).toBe(false)

    const wrongRecipient = directMessage('00000000-0000-4000-8000-000000000021')
    wrongRecipient.recipient.user_id = OTHER_FRIEND_ID
    expect(receiveDirectMessageUnread(wrongRecipient, CURRENT_USER_ID, null)).toBe(false)
    expect(totalMessengerUnreadCount.value).toBe(0)
  })

  it('combines workspace messages and activity into the workspace room', () => {
    receiveWorkspaceMessageUnread(
      workspaceMessage('00000000-0000-4000-8000-000000000016'),
      CURRENT_USER_ID,
      null,
    )
    receiveWorkspaceActivityUnread(
      workspaceActivity('00000000-0000-4000-8000-000000000017'),
      CURRENT_USER_ID,
      null,
    )

    expect(workspaceUnreadCount(WORKSPACE_ID)).toBe(2)
    expect(totalMessengerUnreadCount.value).toBe(2)
  })

  it('adds incoming friend requests to the total unread count', () => {
    expect(receiveFriendRequestUnread(friendRequest(), CURRENT_USER_ID, false)).toBe(true)
    expect(receiveFriendRequestUnread(friendRequest(OTHER_FRIEND_ID), CURRENT_USER_ID, false)).toBe(
      true,
    )

    expect(friendRequestUnreadCount.value).toBe(2)
    expect(totalMessengerUnreadCount.value).toBe(2)
  })

  it('does not count friend requests without a recipient session or while friends are visible', () => {
    expect(receiveFriendRequestUnread(friendRequest(), null, false)).toBe(false)
    expect(receiveFriendRequestUnread(friendRequest(CURRENT_USER_ID), CURRENT_USER_ID, false)).toBe(
      false,
    )
    expect(receiveFriendRequestUnread(friendRequest(), CURRENT_USER_ID, true)).toBe(false)

    expect(friendRequestUnreadCount.value).toBe(0)
    expect(totalMessengerUnreadCount.value).toBe(0)
  })

  it('clears friend request unread without discarding conversation unread', () => {
    receiveFriendRequestUnread(friendRequest(), CURRENT_USER_ID, false)
    receiveDirectMessageUnread(
      directMessage('00000000-0000-4000-8000-000000000022'),
      CURRENT_USER_ID,
      null,
    )

    markFriendRequestsRead()

    expect(friendRequestUnreadCount.value).toBe(0)
    expect(directMessageUnreadCount(FRIEND_ID)).toBe(1)
    expect(totalMessengerUnreadCount.value).toBe(1)
  })

  it('clears only the room that was opened', () => {
    receiveWorkspaceMessageUnread(
      workspaceMessage('00000000-0000-4000-8000-000000000018'),
      CURRENT_USER_ID,
      null,
    )
    receiveDirectMessageUnread(
      directMessage('00000000-0000-4000-8000-000000000019'),
      CURRENT_USER_ID,
      null,
    )

    markWorkspaceConversationRead(WORKSPACE_ID)
    expect(workspaceUnreadCount(WORKSPACE_ID)).toBe(0)
    expect(directMessageUnreadCount(FRIEND_ID)).toBe(1)

    markDirectConversationRead(FRIEND_ID)
    expect(totalMessengerUnreadCount.value).toBe(0)
  })

  it('prunes unread counts for rooms no longer in the directory', () => {
    receiveWorkspaceMessageUnread(workspaceMessage('workspace-message-1'), CURRENT_USER_ID, null)
    receiveWorkspaceMessageUnread(
      workspaceMessage('workspace-message-2', FRIEND_ID, OTHER_WORKSPACE_ID),
      CURRENT_USER_ID,
      null,
    )
    receiveDirectMessageUnread(directMessage('direct-message-1'), CURRENT_USER_ID, null)
    receiveDirectMessageUnread(
      directMessage('direct-message-2', OTHER_FRIEND_ID),
      CURRENT_USER_ID,
      null,
    )

    pruneMessengerUnreadRooms([WORKSPACE_ID], [FRIEND_ID])

    expect(workspaceUnreadCount(WORKSPACE_ID)).toBe(1)
    expect(workspaceUnreadCount(OTHER_WORKSPACE_ID)).toBe(0)
    expect(directMessageUnreadCount(FRIEND_ID)).toBe(1)
    expect(directMessageUnreadCount(OTHER_FRIEND_ID)).toBe(0)
    expect(totalMessengerUnreadCount.value).toBe(2)
  })

  it('parses workspace activity and rejects malformed events', () => {
    expect(parseNotificationEvent(workspaceActivity('activity-1'))).toEqual(
      workspaceActivity('activity-1'),
    )
    expect(
      parseNotificationEvent({
        ...workspaceActivity('activity-2'),
        actor: null,
      }),
    ).toBeNull()
  })
})
