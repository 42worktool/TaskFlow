import { z } from 'zod';

export const REALTIME_PROTOCOL_VERSION = 1 as const;

export const eventNameSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/,
    'Event names must use a namespaced form such as "card.updated"',
  );

export const inboundMessageSchema = z
  .object({
    v: z.literal(REALTIME_PROTOCOL_VERSION),
    event: eventNameSchema,
    requestId: z.string().min(1).max(100).optional(),
    data: z.unknown().optional(),
  })
  .strict();

export const authenticationDataSchema = z
  .object({
    accessToken: z.string().min(1).max(4096),
  })
  .strict();

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export interface OutboundMessage {
  v: typeof REALTIME_PROTOCOL_VERSION;
  event: string;
  requestId?: string;
  data?: unknown;
}

export interface RealtimeErrorData {
  code: string;
  message: string;
  retryable: boolean;
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
  };
}
