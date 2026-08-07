// ============================================================
// signup-rate-limiter.ts — IP-scoped attempt limiter for signup
//
// Mirrors the login attempt limiter in modules/auth/auth.service.ts
// but scopes the counter to the client IP only. The counter is not
// cleared on success: a successful registration is itself the
// protected resource, so clearing would let scripted mass account
// creation slip through.
// ============================================================
import { createHash } from 'crypto'
import { getRedisClient } from './redis'
import { AppError } from '../errors'

const REGISTER_ATTEMPT_LIMIT = 10
const REGISTER_ATTEMPT_WINDOW_SECONDS = 15 * 60

export type SignupRateLimitClient = {
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
}

function registerAttemptKey(clientIp: string): string {
  const fingerprint = createHash('sha256').update(clientIp).digest('hex')
  return `auth:signup-attempts:${fingerprint}`
}

export function createSignupRateLimiter(redis: SignupRateLimitClient) {
  return async (clientIp: string): Promise<void> => {
    const key = registerAttemptKey(clientIp)
    const attempts = await redis.incr(key)
    if (attempts === 1) await redis.expire(key, REGISTER_ATTEMPT_WINDOW_SECONDS)

    if (attempts > REGISTER_ATTEMPT_LIMIT) {
      throw new AppError('SIGNUP_RATE_LIMITED', 429, 'Too many signup attempts. Try again later.')
    }
  }
}

export async function checkSignupRateLimit(clientIp: string): Promise<void> {
  const redis = await getRedisClient()
  await createSignupRateLimiter(redis)(clientIp)
}
