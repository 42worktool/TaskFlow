import { getRedisClient } from './redis';
import { AppError } from '../errors';

const RATE_LIMIT = 20;
const WINDOW_SECONDS = 3600;

function key(email: string): string {
  return `mail:ratelimit:${email}`;
}

class MailRateLimitError extends AppError {
  constructor() {
    super('MAIL_RATE_LIMITED', 429, 'too many email invitations to this address');
  }
}

export async function checkMailRateLimit(email: string): Promise<void> {
  const redis = await getRedisClient();
  const k = key(email);
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, WINDOW_SECONDS);
  if (count > RATE_LIMIT) throw new MailRateLimitError();
}
