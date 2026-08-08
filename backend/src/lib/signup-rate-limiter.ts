// ============================================================
// signup-rate-limiter.ts — IP 단위 회원가입 시도 제한
//
// 로그인 제한과 달리 클라이언트 IP만 키로 사용한다. 회원가입 자체가 보호 대상이므로
// 성공해도 카운터를 지우지 않는다. 성공할 때 초기화하면 자동화된 대량 계정 생성이
// 제한을 우회할 수 있기 때문이다.
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
