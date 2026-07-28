import { z } from 'zod';
import { config } from '../config';
import { verifyAccessToken } from '../modules/auth/auth.service';
import { RealtimeServer } from './server';

export { RealtimeError } from './router';
export type { RealtimeHandlerContext } from './router';

export const realtime = new RealtimeServer({
  ...config.websocket,
  allowedOrigin: config.appOrigin,
  authenticateAccessToken: verifyAccessToken,
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
