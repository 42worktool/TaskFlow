import { getAccessToken } from '../auth'
import { RealtimeClient } from './client'
import type {
  RealtimeClientEvents,
  RealtimeClientRequestResults,
  RealtimeServerEvents,
} from './protocol'

export { RealtimeRequestError } from './client'

export const realtime = new RealtimeClient<
  RealtimeServerEvents,
  RealtimeClientEvents,
  RealtimeClientRequestResults
>({
  tokenProvider: getAccessToken,
})
