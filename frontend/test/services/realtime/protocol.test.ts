// 친구·메시지·접속 상태·워크스페이스 이벤트 데이터의 런타임 검증을 확인한다.
import { describe, expect, it } from 'vitest'
import {
  parseDirectMessage,
  parseFriend,
  parseFriendPresenceEvent,
  parseFriendRequest,
  parseFriendUserIdEvent,
  parseWorkspaceChangedEvent,
  parseWorkspaceMemberPresenceEvent,
  parseWorkspaceMessage,
} from '../../../src/services/realtime/protocol'

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const ENTITY_ID = '00000000-0000-4000-8000-000000000003'
const EVENT_ID = '00000000-0000-4000-8000-000000000004'
const MESSAGE_ID = '00000000-0000-4000-8000-000000000005'
const FRIEND_ID = '00000000-0000-4000-8000-000000000006'
const OCCURRED_AT = '2026-07-29T00:00:00.000Z'

describe('friend presence protocol', () => {
  it('accepts the minimal presence event', () => {
    expect(
      parseFriendPresenceEvent({
        user_id: '00000000-0000-4000-8000-000000000001',
        online: true,
      }),
    ).toEqual({
      user_id: '00000000-0000-4000-8000-000000000001',
      online: true,
    })
  })

  it('rejects malformed presence data', () => {
    expect(parseFriendPresenceEvent({ user_id: 'user-1', online: true })).toBeNull()
    expect(parseFriendPresenceEvent({ user_id: '', online: false })).toBeNull()
  })
})

describe('friend request lifecycle protocol', () => {
  const request = {
    id: FRIEND_ID,
    name: 'Bob',
    profile_image_url: null,
    requested_at: OCCURRED_AT,
  }
  const friend = {
    id: FRIEND_ID,
    name: 'Bob',
    profile_image_url: null,
    friends_since: OCCURRED_AT,
    online: false,
  }

  it('accepts a friend request created/deleted payload', () => {
    expect(parseFriendRequest(request)).toEqual(request)
    expect(parseFriendUserIdEvent({ user_id: FRIEND_ID })).toEqual({
      user_id: FRIEND_ID,
    })
  })

  it('rejects malformed friend request payloads', () => {
    expect(parseFriendRequest({ ...request, id: 'not-a-uuid' })).toBeNull()
    expect(parseFriendRequest({ ...request, name: '' })).toBeNull()
    expect(parseFriendRequest({ ...request, requested_at: 'not-a-date' })).toBeNull()
    expect(parseFriendUserIdEvent({ user_id: 'user-1' })).toBeNull()
  })

  it('accepts a friend request accepted payload', () => {
    expect(parseFriend(friend)).toEqual(friend)
  })

  it('rejects malformed friend payloads', () => {
    expect(parseFriend({ ...friend, online: 'yes' })).toBeNull()
    expect(parseFriend({ ...friend, friends_since: 'not-a-date' })).toBeNull()
  })
})

describe('direct message realtime protocol', () => {
  const message = {
    id: MESSAGE_ID,
    content: '안녕하세요',
    created_at: OCCURRED_AT,
    author: {
      user_id: USER_ID,
      name: 'Sean',
      profile_image_url: null,
    },
    recipient: {
      user_id: FRIEND_ID,
      name: 'Friend',
      profile_image_url: null,
    },
  }

  it('accepts a direct message between two users', () => {
    expect(parseDirectMessage(message)).toEqual(message)
  })

  it('rejects malformed direct messages', () => {
    expect(parseDirectMessage({ ...message, content: '' })).toBeNull()
    expect(parseDirectMessage({ ...message, content: 'x'.repeat(1001) })).toBeNull()
    expect(
      parseDirectMessage({
        ...message,
        recipient: { ...message.recipient, user_id: 'friend-1' },
      }),
    ).toBeNull()
    expect(
      parseDirectMessage({
        ...message,
        recipient: { ...message.recipient, user_id: USER_ID },
      }),
    ).toBeNull()
  })
})

describe('workspace realtime protocol', () => {
  it('accepts a workspace change event', () => {
    const event = {
      event_id: EVENT_ID,
      workspace_id: WORKSPACE_ID,
      entity: 'card' as const,
      action: 'moved' as const,
      entity_id: ENTITY_ID,
      list_ids: ['00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000007'],
      actor_user_id: USER_ID,
      occurred_at: OCCURRED_AT,
    }

    expect(parseWorkspaceChangedEvent(event)).toEqual(event)
  })

  it('rejects malformed workspace change events', () => {
    expect(
      parseWorkspaceChangedEvent({
        event_id: EVENT_ID,
        workspace_id: WORKSPACE_ID,
        entity: 'comment',
        action: 'updated',
        entity_id: ENTITY_ID,
        list_ids: [],
        actor_user_id: USER_ID,
        occurred_at: OCCURRED_AT,
      }),
    ).toBeNull()
    expect(
      parseWorkspaceChangedEvent({
        event_id: EVENT_ID,
        workspace_id: WORKSPACE_ID,
        entity: 'card',
        action: 'updated',
        entity_id: ENTITY_ID,
        list_ids: ['list-1'],
        actor_user_id: USER_ID,
        occurred_at: OCCURRED_AT,
      }),
    ).toBeNull()
  })

  it('accepts workspace member presence changes', () => {
    const event = {
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      online: true,
    }

    expect(parseWorkspaceMemberPresenceEvent(event)).toEqual(event)
  })

  it('rejects malformed workspace member presence changes', () => {
    expect(
      parseWorkspaceMemberPresenceEvent({
        workspace_id: WORKSPACE_ID,
        user_id: 'user-1',
        online: true,
      }),
    ).toBeNull()
    expect(
      parseWorkspaceMemberPresenceEvent({
        workspace_id: WORKSPACE_ID,
        user_id: USER_ID,
        online: 'yes',
      }),
    ).toBeNull()
  })

  it('accepts workspace messages', () => {
    const message = {
      id: MESSAGE_ID,
      workspace_id: WORKSPACE_ID,
      card_id: null,
      content: '안녕하세요',
      created_at: OCCURRED_AT,
      author: {
        user_id: USER_ID,
        name: 'Sean',
        profile_image_url: null,
      },
    }

    expect(parseWorkspaceMessage(message)).toEqual(message)
  })

  it('rejects malformed workspace messages', () => {
    expect(
      parseWorkspaceMessage({
        id: MESSAGE_ID,
        workspace_id: WORKSPACE_ID,
        card_id: null,
        content: '',
        created_at: OCCURRED_AT,
        author: {
          user_id: USER_ID,
          name: 'Sean',
          profile_image_url: null,
        },
      }),
    ).toBeNull()
    expect(
      parseWorkspaceMessage({
        id: MESSAGE_ID,
        workspace_id: WORKSPACE_ID,
        card_id: null,
        content: '안녕하세요',
        created_at: 'not-a-date',
        author: {
          user_id: USER_ID,
          name: 'Sean',
          profile_image_url: null,
        },
      }),
    ).toBeNull()
    expect(
      parseWorkspaceMessage({
        id: MESSAGE_ID,
        workspace_id: WORKSPACE_ID,
        content: '카드 없는 메시지',
        created_at: OCCURRED_AT,
        author: {
          user_id: USER_ID,
          name: 'Sean',
          profile_image_url: null,
        },
      }),
    ).toBeNull()
    expect(
      parseWorkspaceMessage({
        id: MESSAGE_ID,
        workspace_id: WORKSPACE_ID,
        card_id: 'card-1',
        content: '잘못된 카드 참조',
        created_at: OCCURRED_AT,
        author: {
          user_id: USER_ID,
          name: 'Sean',
          profile_image_url: null,
        },
      }),
    ).toBeNull()
  })

  it('accepts a workspace message linked to a card', () => {
    const message = {
      id: MESSAGE_ID,
      workspace_id: WORKSPACE_ID,
      card_id: ENTITY_ID,
      content: '카드 코멘트',
      created_at: OCCURRED_AT,
      author: {
        user_id: USER_ID,
        name: 'Sean',
        profile_image_url: null,
      },
    }

    expect(parseWorkspaceMessage(message)).toEqual(message)
  })
})
