import { getAccessToken } from '../auth'
import { RealtimeClient } from './client'
import type { RealtimeClientEvents, RealtimeServerEvents } from './protocol'

export type {
  RealtimeClientEvents,
  RealtimeErrorData,
  RealtimeReadyData,
  RealtimeServerEvents,
} from './protocol'
export {
  RealtimeClient,
  RealtimeRequestError,
  type RealtimeConnectionState,
} from './client'

export const realtime = new RealtimeClient<RealtimeServerEvents, RealtimeClientEvents>({
  tokenProvider: getAccessToken,
})
