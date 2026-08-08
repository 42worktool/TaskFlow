import { getRedisClient } from './redis'
import { AppError } from '../errors'

const RATE_LIMIT = 20
const WINDOW_SECONDS = 3600

function recipientKey(email: string): string {
  // 배포 중인 수신자 카운터가 초기화되지 않도록 기존 Redis 키 형식을 유지한다.
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
    // 발신자와 수신자 양쪽을 제한해 한 사용자의 대량 발송과 한 주소에 대한 집중 공격을 함께 막는다.
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
