import { getAccessToken } from '../auth'
import { RealtimeClient } from './client'
import type {
  RealtimeClientEvents,
  RealtimeClientRequestResults,
  RealtimeServerEvents,
} from './protocol'

export {
  isRealtimeEventName,
  isRealtimeControlEvent,
  REALTIME_CLIENT_CONTROL_EVENTS,
  REALTIME_CLOSE_CODE,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_SERVER_CONTROL_EVENTS,
} from './protocol'
export type {
  RealtimeAuthRefreshResult,
  RealtimeClientEvents,
  RealtimeClientRequestResults,
  RealtimeErrorData,
  RealtimeReadyData,
  RealtimeServerEvents,
} from './protocol'
export {
  RealtimeClient,
  RealtimeRequestError,
  RealtimeSendError,
  type RealtimeClientOptions,
  type RealtimeConnectionState,
  type RealtimeSendErrorCode,
  type RealtimeSubscriptionRecovery,
} from './client'

export const realtime = new RealtimeClient<
  RealtimeServerEvents,
  RealtimeClientEvents,
  RealtimeClientRequestResults
>({
  tokenProvider: getAccessToken,
})
