import type { NotificationEvent } from '../../types'

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
}

export interface RealtimeClientEvents {
  'system.ping': {
    clientTime?: string
  }
}

export interface RealtimeClientRequestResults {
  'system.ping': {
    clientTime?: string
    serverTime: string
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

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}
