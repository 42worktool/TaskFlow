import { z } from 'zod';
import { config } from '../config';
import { verifyAccessTokenPrincipal } from '../modules/auth/auth.service';
import { RealtimeServer } from './server';

export { RealtimeServer };
export { RealtimeError } from './router';
export type { RealtimeHandlerContext } from './router';
export {
  isRealtimeControlEvent,
  REALTIME_CLIENT_CONTROL_EVENTS,
  REALTIME_CLOSE_CODE,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_SERVER_CONTROL_EVENTS,
} from './protocol';
export type { RealtimeAuthRefreshResult, RealtimeReadyData } from './protocol';
export type {
  PublishOptions,
  RealtimeConnectionDisconnectedInfo,
  RealtimeConnectionInfo,
  RealtimeConnectionLifecycleListener,
  RealtimeServerOptions,
} from './server';

export const realtime = new RealtimeServer({
  ...config.websocket,
  allowedOrigin: config.appOrigin,
  authenticateAccessToken: verifyAccessTokenPrincipal,
});

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
);
