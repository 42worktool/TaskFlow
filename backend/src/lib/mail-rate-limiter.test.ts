import assert from 'node:assert/strict'
import test from 'node:test'

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

function isRateLimitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'MAIL_RATE_LIMITED'
  )
}

test('mail rate limit restricts a sender across recipient addresses', async () => {
  const { createMailRateLimitChecker } = await import('./mail-rate-limiter')
  const redis = new FakeRedis()
  const check = createMailRateLimitChecker(redis)

  for (let index = 0; index < 20; index += 1) {
    await check({
      senderUserId: 'sender',
      recipientEmail: `recipient-${index}@example.com`,
    })
  }

  await assert.rejects(
    check({
      senderUserId: 'sender',
      recipientEmail: 'recipient-20@example.com',
    }),
    isRateLimitError,
  )
  assert.equal(redis.counts.get('mail:ratelimit:sender:sender'), 21)
})

test('mail rate limit restricts a recipient across senders', async () => {
  const { createMailRateLimitChecker } = await import('./mail-rate-limiter')
  const redis = new FakeRedis()
  const check = createMailRateLimitChecker(redis)

  for (let index = 0; index < 20; index += 1) {
    await check({
      senderUserId: `sender-${index}`,
      recipientEmail: 'recipient@example.com',
    })
  }

  await assert.rejects(
    check({
      senderUserId: 'sender-20',
      recipientEmail: 'recipient@example.com',
    }),
    isRateLimitError,
  )
  assert.equal(redis.counts.get('mail:ratelimit:recipient@example.com'), 21)
})

test('mail rate limit gives new counters a one-hour expiration', async () => {
  const { createMailRateLimitChecker } = await import('./mail-rate-limiter')
  const redis = new FakeRedis()
  const check = createMailRateLimitChecker(redis)

  await check({
    senderUserId: 'sender',
    recipientEmail: 'recipient@example.com',
  })

  assert.equal(redis.expirations.get('mail:ratelimit:sender:sender'), 3600)
  assert.equal(
    redis.expirations.get('mail:ratelimit:recipient@example.com'),
    3600,
  )
})
