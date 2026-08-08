// IP 단위의 회원가입 제한과 만료, 성공한 시도의 집계 방식을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'

Object.assign(process.env, {
  APP_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/oauth/callback/google',
  REDIS_URL: 'redis://localhost:6379',
  SMTP_HOST: 'localhost',
  SMTP_USER: 'test',
  SMTP_PASS: 'test',
  SMTP_FROM: 'test@example.com',
})

class FakeRedis {
  readonly counts = new Map<string, number>()
  readonly expirations = new Map<string, number>()

  async incr(key: string): Promise<number> {
    const count = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, count)
    return count
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    this.expirations.set(key, seconds)
    return true
  }
}

function signupKey(clientIp: string): string {
  const fingerprint = createHash('sha256').update(clientIp).digest('hex')
  return `auth:signup-attempts:${fingerprint}`
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'SIGNUP_RATE_LIMITED'
}

test('signup rate limit rejects the eleventh attempt from the same IP', async () => {
  const { createSignupRateLimiter } = await import('../../src/lib/signup-rate-limiter')
  const redis = new FakeRedis()
  const check = createSignupRateLimiter(redis)

  for (let index = 0; index < 10; index += 1) {
    await check('203.0.113.10')
  }

  await assert.rejects(check('203.0.113.10'), isRateLimitError)
  assert.equal(redis.counts.get(signupKey('203.0.113.10')), 11)
})

test('signup rate limit gives a new counter a 900-second expiration', async () => {
  const { createSignupRateLimiter } = await import('../../src/lib/signup-rate-limiter')
  const redis = new FakeRedis()
  const check = createSignupRateLimiter(redis)

  await check('203.0.113.20')

  assert.equal(redis.expirations.get(signupKey('203.0.113.20')), 900)
})

test('signup rate limit keeps counting after a successful attempt', async () => {
  const { createSignupRateLimiter } = await import('../../src/lib/signup-rate-limiter')
  const redis = new FakeRedis()
  const check = createSignupRateLimiter(redis)

  for (let index = 0; index < 10; index += 1) {
    await check('203.0.113.30')
  }

  await assert.rejects(check('203.0.113.30'), isRateLimitError)
  assert.equal(redis.counts.get(signupKey('203.0.113.30')), 11)
})
