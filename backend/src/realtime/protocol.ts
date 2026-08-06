import { z } from 'zod'

export const REALTIME_PROTOCOL_VERSION = 1 as const

export const REALTIME_CLOSE_CODE = {
  AUTHENTICATION_REQUIRED: 4401,
  SESSION_TERMINATED: 4403,
  RESYNC_REQUIRED: 4410,
  RATE_LIMITED: 4429,
} as const

export const REALTIME_CLIENT_CONTROL_EVENTS = ['auth.authenticate', 'auth.refresh'] as const

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

export const eventNameSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/,
    'Event names must use a namespaced form such as "card.updated"',
  )

export const inboundMessageSchema = z
  .object({
    v: z.literal(REALTIME_PROTOCOL_VERSION),
    event: eventNameSchema,
    requestId: z.string().min(1).max(100).optional(),
    data: z.unknown().optional(),
  })
  .strict()

export const authenticationDataSchema = z
  .object({
    accessToken: z.string().min(1).max(4096),
  })
  .strict()

export type InboundMessage = z.infer<typeof inboundMessageSchema>

export interface OutboundMessage {
  v: typeof REALTIME_PROTOCOL_VERSION
  event: string
  requestId?: string
  data?: unknown
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

export function outboundMessage(
  event: string,
  data?: unknown,
  requestId?: string,
): OutboundMessage {
  return {
    v: REALTIME_PROTOCOL_VERSION,
    event,
    ...(requestId ? { requestId } : {}),
    ...(data === undefined ? {} : { data }),
  }
}
