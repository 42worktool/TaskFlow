import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'

function setRequiredEnvironment(): void {
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
}

test('access tokens preserve the configured subject, audience, and expiry', async () => {
  setRequiredEnvironment()
  const { signAccessToken, verifyAccessToken } = await import('./access-token')

  const issuedAt = Date.now()
  const principal = verifyAccessToken(signAccessToken('user-1'))

  assert.equal(principal.userId, 'user-1')
  assert.ok(principal.expiresAt > issuedAt)
})

test('access token verification keeps missing principal errors explicit', async () => {
  setRequiredEnvironment()
  const [{ config }, { verifyAccessToken }] = await Promise.all([
    import('../config'),
    import('./access-token'),
  ])
  const token = jwt.sign({}, config.jwtAccessSecret, {
    algorithm: 'HS256',
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: config.accessTokenTtlSeconds,
  })

  assert.throws(() => verifyAccessToken(token), /Access token subject is missing/)
})
