import { getRedisClient } from './redis'
import { AppError } from '../errors'

const RATE_LIMIT = 20
const WINDOW_SECONDS = 3600

function recipientKey(email: string): string {
  // Keep the existing key format so deployed recipient counters remain valid.
  return `mail:ratelimit:${email}`
}

function senderKey(userId: string): string {
  return `mail:ratelimit:sender:${userId}`
}

class MailRateLimitError extends AppError {
  constructor() {
    super('MAIL_RATE_LIMITED', 429, 'too many email invitations')
  }
}

type MailRateLimitClient = {
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
}

async function increment(redis: MailRateLimitClient, key: string): Promise<number> {
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, WINDOW_SECONDS)
  return count
}

type MailRateLimitInput = {
  senderUserId: string
  recipientEmail: string
}

export function createMailRateLimitChecker(redis: MailRateLimitClient) {
  return async (input: MailRateLimitInput): Promise<void> => {
    const [senderCount, recipientCount] = await Promise.all([
      increment(redis, senderKey(input.senderUserId)),
      increment(redis, recipientKey(input.recipientEmail)),
    ])

    if (senderCount > RATE_LIMIT || recipientCount > RATE_LIMIT) {
      throw new MailRateLimitError()
    }
  }
}

export async function checkMailRateLimit(input: MailRateLimitInput): Promise<void> {
  const redis = await getRedisClient()
  await createMailRateLimitChecker(redis)(input)
}
