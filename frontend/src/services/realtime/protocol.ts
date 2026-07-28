export const REALTIME_PROTOCOL_VERSION = 1 as const

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
}

export interface RealtimeServerEvents {
  'system.ready': RealtimeReadyData
  'system.error': RealtimeErrorData
}

export interface RealtimeClientEvents {
  'system.ping': {
    clientTime?: string
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
    typeof candidate.event !== 'string' ||
    (candidate.requestId !== undefined && typeof candidate.requestId !== 'string')
  ) {
    return null
  }
  return candidate as RealtimeMessage
}
