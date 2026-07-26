import { getRedisClient } from './redis';

const RATE_LIMIT = 5;
const WINDOW_SECONDS = 3600;

function key(email: string): string {
  return `mail:ratelimit:${email}`;
}

export class MailRateLimitError extends Error {
  code = 'MAIL_RATE_LIMITED' as const;
}

export async function checkMailRateLimit(email: string): Promise<void> {
  const redis = await getRedisClient();
  const k = key(email);
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, WINDOW_SECONDS);
  if (count > RATE_LIMIT) throw new MailRateLimitError();
}
