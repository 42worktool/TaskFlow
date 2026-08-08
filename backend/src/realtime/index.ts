import { z } from 'zod'
import { config } from '../config'
import { verifyAccessToken } from '../lib/access-token'
import { RealtimeServer } from './server'

export { RealtimeError } from './router'
export type {
  RealtimeConnectionDisconnectedInfo,
  RealtimeConnectionInfo,
  RealtimeConnectionLifecycleListener,
} from './server'

export const realtime = new RealtimeServer({
  // HTTP 인증과 같은 access token 검증기를 주입해 두 경로의 사용자 판정 기준을 통일한다.
  ...config.websocket,
  allowedOrigin: config.appOrigin,
  authenticateAccessToken: verifyAccessToken,
})

realtime.register(
  'system.ping',
  z
    .object({
      clientTime: z.string().datetime().optional(),
    })
    .strict()
    .default({}),
  (_context, data) => ({
    clientTime: data.clientTime,
    serverTime: new Date().toISOString(),
  }),
)
