import { createHash, randomBytes } from 'crypto'
import { Prisma, User } from '@prisma/client'
import { OAuth2Client } from 'google-auth-library'
import { config } from '../../config'
import { AppError } from '../../errors'
import { prisma } from '../../db'
import { signAccessToken } from '../../lib/access-token'
import { getRedisClient } from '../../lib/redis'
import { deleteUploadedFile } from '../../lib/upload'
import { checkSignupRateLimit } from '../../lib/signup-rate-limiter'
import { normalizedEmailSchema, normalizeEmail } from '../../lib/validation'
import { hashPassword, accountName, safeEqual, safeReturnTo, verifyPassword } from './auth.utils'

const googleClient = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRedirectUri,
)

const OAUTH_STATE_PREFIX = 'oauth:state:'
const REFRESH_SESSION_PREFIX = 'auth:refresh:'
const USER_REFRESH_SESSIONS_PREFIX = 'auth:user-sessions:'
const LOGIN_ATTEMPT_PREFIX = 'auth:login-attempts:'
const LOGIN_ATTEMPT_LIMIT = 10
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60

// 인증 서비스는 비밀번호/Google 계정을 사용자 한 명으로 연결하고,
// 짧은 access token과 서버에서 폐기 가능한 refresh session을 함께 관리한다.

export interface UserPublic {
  id: string
  email: string
  name: string
  profile_image_url: string | null
  headline: string
  linkedin_url: string | null
  created_at: string
  auth_provider: 'password' | 'google'
}

interface OAuthStateRecord {
  nonce: string
  returnTo: string
}

interface RefreshSessionRecord {
  userId: string
  createdAt: string
}

function registrationEmail(value: unknown): string {
  const result = normalizedEmailSchema.safeParse(value)
  if (!result.success) {
    throw new AppError('INVALID_EMAIL', 400, 'A valid email address is required')
  }
  return result.data
}

function registrationPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new AppError('INVALID_PASSWORD', 400, 'Password must be between 8 and 128 characters')
  }
  return value
}

function loginAttemptKey(email: string, clientKey: string): string {
  // 이메일과 접속자 식별자를 해시해 개인정보가 Redis 키에 그대로 남지 않게 한다.
  const fingerprint = createHash('sha256').update(`${clientKey}\0${email}`).digest('hex')
  return `${LOGIN_ATTEMPT_PREFIX}${fingerprint}`
}

async function assertLoginAllowed(key: string): Promise<void> {
  const redis = await getRedisClient()
  const attempts = Number(await redis.get(key)) || 0
  if (attempts >= LOGIN_ATTEMPT_LIMIT) {
    throw new AppError(
      'LOGIN_RATE_LIMITED',
      429,
      'Too many failed login attempts. Try again later.',
    )
  }
}

async function recordFailedLogin(key: string): Promise<void> {
  const redis = await getRedisClient()
  const attempts = await redis.incr(key)
  if (attempts === 1) await redis.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS)
}

export async function registerWithPassword(input: {
  name: unknown
  email: unknown
  password: unknown
  clientIp: string
}): Promise<UserPublic> {
  // 빠른 중복 확인으로 일반 충돌을 친절하게 처리하되, 동시 가입 경쟁은
  // DB unique 제약(P2002)을 마지막 방어선으로 사용한다.
  await checkSignupRateLimit(input.clientIp)

  const name = accountName(input.name)
  const email = registrationEmail(input.email)
  const password = registrationPassword(input.password)

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existingUser) {
    throw new AppError('EMAIL_ALREADY_REGISTERED', 409, 'This email is already registered')
  }

  const passwordHash = await hashPassword(password)
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password_hash: passwordHash,
      },
    })
    return publicUser(user)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('EMAIL_ALREADY_REGISTERED', 409, 'This email is already registered')
    }
    throw error
  }
}

export async function authenticateWithPassword(input: {
  email: unknown
  password: unknown
  clientKey: string
}): Promise<UserPublic> {
  const parsedEmail = normalizedEmailSchema.safeParse(input.email)
  const email = parsedEmail.success ? parsedEmail.data : ''
  const password =
    typeof input.password === 'string' && input.password.length <= 128 ? input.password : ''
  const attemptKey = loginAttemptKey(email, input.clientKey)
  await assertLoginAllowed(attemptKey)

  const user = parsedEmail.success
    ? await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      })
    : null
  // 사용자가 없거나 입력 형식이 틀려도 동일한 scrypt 검증을 수행해
  // 응답 시간과 오류 메시지로 계정 존재 여부가 드러나지 않게 한다.
  const passwordMatches = await verifyPassword(password, user?.password_hash ?? null)

  if (!user || !passwordMatches) {
    await recordFailedLogin(attemptKey)
    throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect')
  }

  const redis = await getRedisClient()
  await redis.del(attemptKey)
  return publicUser(user)
}

function publicUser(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profile_image_url: user.profile_image_url,
    headline: user.headline,
    linkedin_url: user.linkedin_url,
    created_at: user.created_at.toISOString(),
    auth_provider: user.password_hash === null ? 'google' : 'password',
  }
}

function stateKey(state: string): string {
  // 원본 bearer 값을 Redis 키로 노출하지 않고 해시만 저장한다.
  return `${OAUTH_STATE_PREFIX}${createHash('sha256').update(state).digest('hex')}`
}

function refreshKey(token: string): string {
  return `${REFRESH_SESSION_PREFIX}${createHash('sha256').update(token).digest('hex')}`
}

function userSessionsKey(userId: string): string {
  return `${USER_REFRESH_SESSIONS_PREFIX}${userId}`
}

export async function beginGoogleOAuth(returnToValue: unknown): Promise<{
  authorizationUrl: string
  state: string
}> {
  // state는 요청 위조를, nonce는 다른 인증 응답의 재사용을 막는다.
  // 둘 모두 Redis에서 짧게 보관해 서버가 발급한 요청인지 확인한다.
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const record: OAuthStateRecord = { nonce, returnTo: safeReturnTo(returnToValue) }
  const redis = await getRedisClient()

  await redis.set(stateKey(state), JSON.stringify(record), {
    EX: config.oauthStateTtlSeconds,
    NX: true,
  })

  return {
    state,
    authorizationUrl: googleClient.generateAuthUrl({
      access_type: 'online',
      include_granted_scopes: true,
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
    }),
  }
}

async function consumeOAuthState(
  queryState: string,
  cookieState: string | undefined,
): Promise<OAuthStateRecord> {
  if (!safeEqual(queryState, cookieState)) {
    throw new AppError('INVALID_OAUTH_STATE', 401, 'OAuth state did not match')
  }

  const redis = await getRedisClient()
  // getDel로 검증과 소비를 원자적으로 처리해 같은 콜백을 두 번 사용할 수 없게 한다.
  const raw = await redis.getDel(stateKey(queryState))
  if (!raw) {
    throw new AppError('EXPIRED_OAUTH_STATE', 401, 'OAuth state expired or was already used')
  }

  try {
    return JSON.parse(raw) as OAuthStateRecord
  } catch {
    throw new AppError('INVALID_OAUTH_STATE', 401, 'Stored OAuth state was invalid')
  }
}

async function findOrCreateGoogleUser(payload: {
  sub: string
  email: string
  name?: string
  picture?: string
}): Promise<User> {
  const email = normalizeEmail(payload.email)

  // OAuth 계정 조회, 기존 이메일 연결, 신규 사용자 생성을 한 트랜잭션으로 묶어
  // 동시 콜백이 중복 계정이나 절반만 연결된 계정을 만들지 않게 한다.
  return prisma.$transaction(async (tx) => {
    const account = await tx.oAuthAccount.findUnique({
      where: {
        provider_provider_id: {
          provider: 'google',
          provider_id: payload.sub,
        },
      },
      include: { user: true },
    })
    if (account) return account.user

    const existingUser = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })

    if (existingUser) {
      // 이메일이 같다는 이유만으로 계정을 자동 병합하면 계정 탈취 위험이 있으므로
      // 운영자가 명시적으로 허용한 경우에만 검증된 이메일을 연결한다.
      if (!config.autoLinkVerifiedEmail) {
        throw new AppError(
          'ACCOUNT_LINK_REQUIRED',
          409,
          'An account already exists for this email. Sign in with the existing method first.',
        )
      }

      await tx.oAuthAccount.create({
        data: {
          user_id: existingUser.id,
          provider: 'google',
          provider_id: payload.sub,
        },
      })
      return existingUser
    }

    return tx.user.create({
      data: {
        email,
        password_hash: null,
        name: payload.name?.trim() || email.split('@')[0] || 'Google 사용자',
        profile_image_url: payload.picture || null,
        oauth_accounts: {
          create: {
            provider: 'google',
            provider_id: payload.sub,
          },
        },
      },
    })
  })
}

export async function completeGoogleOAuth(input: {
  code: string
  state: string
  stateCookie: string | undefined
}): Promise<{ user: UserPublic; returnTo: string }> {
  const stateRecord = await consumeOAuthState(input.state, input.stateCookie)
  const tokenResponse = await googleClient.getToken(input.code)
  const idToken = tokenResponse.tokens.id_token
  if (!idToken) {
    throw new AppError('MISSING_ID_TOKEN', 401, 'Google did not return an ID token')
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  })
  const payload = ticket.getPayload()

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new AppError(
      'INVALID_GOOGLE_IDENTITY',
      401,
      'Google account identity was incomplete or unverified',
    )
  }
  if (!safeEqual(payload.nonce, stateRecord.nonce)) {
    throw new AppError('INVALID_OAUTH_NONCE', 401, 'OAuth nonce did not match')
  }

  const user = await findOrCreateGoogleUser({
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  })

  return { user: publicUser(user), returnTo: stateRecord.returnTo }
}

export async function createSession(userId: string): Promise<{
  accessToken: string
  refreshToken: string
}> {
  const refreshToken = randomBytes(48).toString('base64url')
  const session: RefreshSessionRecord = {
    userId,
    createdAt: new Date().toISOString(),
  }
  const redis = await getRedisClient()
  const sessionKey = refreshKey(refreshToken)
  const indexKey = userSessionsKey(userId)
  // 실제 refresh token 대신 해시 키를 저장하고 사용자별 인덱스도 함께 관리한다.
  // 이 인덱스는 계정 삭제 시 해당 사용자의 모든 세션을 한 번에 폐기하는 데 쓴다.
  await redis
    .multi()
    .set(sessionKey, JSON.stringify(session), { EX: config.refreshTokenTtlSeconds })
    .sAdd(indexKey, sessionKey)
    .expire(indexKey, config.refreshTokenTtlSeconds)
    .exec()

  return { accessToken: signAccessToken(userId), refreshToken }
}

export async function rotateSession(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  user: UserPublic
}> {
  const redis = await getRedisClient()
  const oldSessionKey = refreshKey(refreshToken)
  // refresh token은 한 번 사용하면 즉시 없애는 회전 방식으로 재사용 공격을 제한한다.
  const raw = await redis.getDel(oldSessionKey)
  if (!raw) {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh token is invalid or expired')
  }

  let session: RefreshSessionRecord
  try {
    session = JSON.parse(raw) as RefreshSessionRecord
  } catch {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh session was invalid')
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh session user no longer exists')
  }

  await redis.sRem(userSessionsKey(user.id), oldSessionKey)
  const newSession = await createSession(user.id)
  return { ...newSession, user: publicUser(user) }
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const redis = await getRedisClient()
  const sessionKey = refreshKey(refreshToken)
  const raw = await redis.get(sessionKey)
  if (!raw) return

  try {
    const session = JSON.parse(raw) as RefreshSessionRecord
    await redis.multi().del(sessionKey).sRem(userSessionsKey(session.userId), sessionKey).exec()
  } catch {
    await redis.del(sessionKey)
  }
}

export async function getCurrentUser(userId: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User no longer exists')
  return publicUser(user)
}

export async function updateCurrentUser(
  userId: string,
  input: { name?: string; headline?: string; linkedinUrl?: string | null },
): Promise<UserPublic> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
      ...(input.linkedinUrl !== undefined ? { linkedin_url: input.linkedinUrl } : {}),
    },
  })
  return publicUser(user)
}

export async function deleteCurrentUser(userId: string): Promise<void> {
  // OWNER가 사라져 관리 불가능한 워크스페이스가 남지 않도록 계정 삭제 전에
  // 소유권 위임 또는 워크스페이스 삭제를 강제한다.
  await prisma.$transaction(async (tx) => {
    const ownedWorkspace = await tx.workspaceMember.findFirst({
      where: {
        user_id: userId,
        role: 'OWNER',
        deleted_at: null,
        workspace: { deleted_at: null },
      },
      select: { workspace_id: true },
    })
    if (ownedWorkspace) {
      throw new AppError(
        'OWNED_WORKSPACES_REMAIN',
        409,
        'transfer or delete every owned workspace before deleting your account',
      )
    }

    await tx.user.delete({ where: { id: userId } })
  })

  const redis = await getRedisClient()
  const indexKey = userSessionsKey(userId)
  const sessionKeys = await redis.sMembers(indexKey)
  await redis.del([...sessionKeys, indexKey])
}

const AVATAR_URL_PREFIX = '/uploads/avatars/'

async function replaceAvatarUrl(userId: string, url: string | null): Promise<UserPublic> {
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { profile_image_url: true },
  })

  const user = await prisma.user.update({
    where: { id: userId },
    data: { profile_image_url: url },
  })

  // DB 갱신이 성공한 뒤에만 이전 로컬 파일을 지운다. Google 등 외부 URL은 삭제 대상이 아니다.
  if (previous?.profile_image_url?.startsWith(AVATAR_URL_PREFIX)) {
    await deleteUploadedFile('avatars', previous.profile_image_url.slice(AVATAR_URL_PREFIX.length))
  }

  return publicUser(user)
}

export async function updateAvatar(userId: string, file: Express.Multer.File): Promise<UserPublic> {
  return replaceAvatarUrl(userId, `${AVATAR_URL_PREFIX}${file.filename}`)
}

export async function removeAvatar(userId: string): Promise<UserPublic> {
  return replaceAvatarUrl(userId, null)
}
