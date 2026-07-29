import type {
  FriendPresenceEvent,
  NotificationEvent,
  WorkspaceChangedEvent,
  WorkspaceMemberPresenceEvent,
  WorkspaceMessage,
  WorkspaceSubscriptionResult,
} from '../../types'

export const REALTIME_PROTOCOL_VERSION = 1 as const
export const REALTIME_CLOSE_CODE = {
  AUTHENTICATION_REQUIRED: 4401,
  SESSION_TERMINATED: 4403,
  RESYNC_REQUIRED: 4410,
  RATE_LIMITED: 4429,
} as const

export const REALTIME_CLIENT_CONTROL_EVENTS = [
  'auth.authenticate',
  'auth.refresh',
] as const

export const REALTIME_SERVER_CONTROL_EVENTS = [
  'system.ready',
  'system.ack',
  'system.error',
] as const

const realtimeControlEvents = new Set<string>([
  ...REALTIME_CLIENT_CONTROL_EVENTS,
  ...REALTIME_SERVER_CONTROL_EVENTS,
])

export function isRealtimeControlEvent(event: string): boolean {
  return realtimeControlEvents.has(event)
}

const REALTIME_EVENT_NAME_PATTERN =
  /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface RealtimeMessage<T = unknown> {
  v: typeof REALTIME_PROTOCOL_VERSION
  event: string
  requestId?: string
  data?: T
}

export interface RealtimeErrorData {
  code: string
  message: string
  retryable: boolean
}

export interface RealtimeReadyData {
  connectionId: string
  userId: string
  protocolVersion: typeof REALTIME_PROTOCOL_VERSION
  serverTime: string
  accessTokenExpiresAt: string
}

export interface RealtimeAuthRefreshResult {
  accessTokenExpiresAt: string
}

export interface RealtimeServerEvents {
  'system.ready': RealtimeReadyData
  'system.error': RealtimeErrorData
  'notification.created': NotificationEvent
  'friend.presence_changed': FriendPresenceEvent
  'workspace.changed': WorkspaceChangedEvent
  'workspace.member_presence_changed': WorkspaceMemberPresenceEvent
  'workspace.message_created': WorkspaceMessage
}

export interface RealtimeClientEvents {
  'system.ping': {
    clientTime?: string
  }
  'workspace.subscribe': {
    workspace_id: string
  }
  'workspace.unsubscribe': {
    workspace_id: string
  }
}

export interface RealtimeClientRequestResults {
  'system.ping': {
    clientTime?: string
    serverTime: string
  }
  'workspace.subscribe': WorkspaceSubscriptionResult
  'workspace.unsubscribe': {
    workspace_id: string
  }
}

export function parseRealtimeMessage(raw: string): RealtimeMessage | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<RealtimeMessage>
  if (
    candidate.v !== REALTIME_PROTOCOL_VERSION ||
    !isRealtimeEventName(candidate.event) ||
    (candidate.requestId !== undefined &&
      (typeof candidate.requestId !== 'string' ||
        candidate.requestId.length < 1 ||
        candidate.requestId.length > 100))
  ) {
    return null
  }
  return candidate as RealtimeMessage
}

export function isRealtimeEventName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 3 &&
    value.length <= 100 &&
    REALTIME_EVENT_NAME_PATTERN.test(value)
  )
}

export function parseRealtimeReadyData(value: unknown): RealtimeReadyData | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<RealtimeReadyData>
  if (
    typeof candidate.connectionId !== 'string' ||
    candidate.connectionId.length === 0 ||
    typeof candidate.userId !== 'string' ||
    candidate.userId.length === 0 ||
    candidate.protocolVersion !== REALTIME_PROTOCOL_VERSION ||
    !isIsoDate(candidate.serverTime) ||
    !isIsoDate(candidate.accessTokenExpiresAt)
  ) {
    return null
  }
  return candidate as RealtimeReadyData
}

export function parseRealtimeAuthRefreshResult(
  value: unknown,
): RealtimeAuthRefreshResult | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<RealtimeAuthRefreshResult>
  if (!isIsoDate(candidate.accessTokenExpiresAt)) return null
  return candidate as RealtimeAuthRefreshResult
}

export function parseFriendPresenceEvent(
  value: unknown,
): FriendPresenceEvent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<FriendPresenceEvent>
  if (
    typeof candidate.user_id !== 'string' ||
    !UUID_PATTERN.test(candidate.user_id) ||
    typeof candidate.online !== 'boolean'
  ) {
    return null
  }
  return candidate as FriendPresenceEvent
}

export function parseWorkspaceChangedEvent(
  value: unknown,
): WorkspaceChangedEvent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<WorkspaceChangedEvent>
  if (
    !isUuid(candidate.event_id) ||
    !isUuid(candidate.workspace_id) ||
    (candidate.entity !== 'workspace' &&
      candidate.entity !== 'member' &&
      candidate.entity !== 'list' &&
      candidate.entity !== 'card') ||
    (candidate.action !== 'created' &&
      candidate.action !== 'updated' &&
      candidate.action !== 'deleted' &&
      candidate.action !== 'moved') ||
    !isUuid(candidate.entity_id) ||
    !Array.isArray(candidate.list_ids) ||
    !candidate.list_ids.every(isUuid) ||
    !isUuid(candidate.actor_user_id) ||
    !isIsoDate(candidate.occurred_at)
  ) {
    return null
  }
  return candidate as WorkspaceChangedEvent
}

export function parseWorkspaceMemberPresenceEvent(
  value: unknown,
): WorkspaceMemberPresenceEvent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<WorkspaceMemberPresenceEvent>
  if (
    !isUuid(candidate.workspace_id) ||
    !isUuid(candidate.user_id) ||
    typeof candidate.online !== 'boolean'
  ) {
    return null
  }
  return candidate as WorkspaceMemberPresenceEvent
}

export function parseWorkspaceMessage(
  value: unknown,
): WorkspaceMessage | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<WorkspaceMessage>
  const author = candidate.author
  if (
    !isUuid(candidate.id) ||
    !isUuid(candidate.workspace_id) ||
    typeof candidate.content !== 'string' ||
    candidate.content.length === 0 ||
    !isIsoDate(candidate.created_at) ||
    !author ||
    typeof author !== 'object' ||
    !isUuid(author.user_id) ||
    typeof author.name !== 'string' ||
    author.name.length === 0 ||
    (author.profile_image_url !== null &&
      typeof author.profile_image_url !== 'string')
  ) {
    return null
  }
  return candidate as WorkspaceMessage
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}
