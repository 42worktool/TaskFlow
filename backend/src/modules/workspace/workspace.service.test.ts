import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import jwt from 'jsonwebtoken'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'

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

function stubMethod(
  t: TestContext,
  target: object,
  name: string,
  implementation: (...args: any[]) => any,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, name)
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: implementation,
  })
  t.after(() => {
    if (descriptor) Object.defineProperty(target, name, descriptor)
    else Reflect.deleteProperty(target, name)
  })
}

function workspace() {
  const now = new Date('2026-07-29T00:00:00.000Z')
  return {
    id: WORKSPACE_ID,
    name: 'Workspace',
    is_public: false,
    created_at: now,
    created_by: USER_ID,
    updated_at: now,
    updated_by: USER_ID,
    deleted_at: null,
    deleted_by: null,
    members: [],
  }
}

test('workspace invitation acceptance is bound to the invited email', async (t) => {
  setRequiredEnvironment()
  const [
    { prisma },
    { config },
    { acceptInvite, generateInviteToken },
  ] = await Promise.all([
    import('../../db'),
    import('../../config'),
    import('./workspace.service'),
  ])

  await t.test('rejects a token that is not a workspace invitation', async () => {
    const accessLikeToken = jwt.sign({}, config.jwtAccessSecret, {
      algorithm: 'HS256',
      subject: USER_ID,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      expiresIn: 60,
    })

    await assert.rejects(
      () => acceptInvite({ userId: USER_ID, token: accessLikeToken }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'INVITE_TOKEN_INVALID',
    )
  })

  await t.test('rejects a different signed-in account', async (t) => {
    stubMethod(t, prisma.user, 'findFirst', async () => ({
      email: 'other@example.com',
    }))

    await assert.rejects(
      () =>
        acceptInvite({
          userId: USER_ID,
          token: generateInviteToken(
            WORKSPACE_ID,
            'MEMBER',
            'invitee@example.com',
          ),
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'INVITE_EMAIL_MISMATCH',
    )
  })

  await t.test('accepts a case-insensitive email match', async (t) => {
    stubMethod(t, prisma.user, 'findFirst', async () => ({
      email: 'invitee@example.com',
    }))
    stubMethod(t, prisma.workspace, 'findFirst', async () => workspace())
    stubMethod(t, prisma.workspaceMember, 'findUnique', async () => null)

    let membershipCreate: unknown
    stubMethod(t, prisma.workspaceMember, 'create', async (args) => {
      membershipCreate = args
      return {}
    })

    const accepted = await acceptInvite({
      userId: USER_ID,
      token: generateInviteToken(
        WORKSPACE_ID,
        'MEMBER',
        'Invitee@Example.COM',
      ),
    })

    assert.equal(accepted.id, WORKSPACE_ID)
    assert.deepEqual(membershipCreate, {
      data: {
        workspace_id: WORKSPACE_ID,
        user_id: USER_ID,
        role: 'MEMBER',
        created_by: USER_ID,
        updated_by: USER_ID,
      },
    })
  })
})
