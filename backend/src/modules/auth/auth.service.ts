import { createHash, randomBytes } from 'crypto';
import { Prisma, User } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../../config';
import { AppError } from '../../errors';
import { prisma } from '../../db';
import { getRedisClient } from '../../lib/redis';
import {
  hashPassword,
  accountName,
  isValidEmail,
  normalizeEmail,
  safeEqual,
  safeReturnTo,
  verifyPassword,
} from './auth.utils';

const googleClient = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRedirectUri,
);

const OAUTH_STATE_PREFIX = 'oauth:state:';
const REFRESH_SESSION_PREFIX = 'auth:refresh:';
const USER_REFRESH_SESSIONS_PREFIX = 'auth:user-sessions:';
const LOGIN_ATTEMPT_PREFIX = 'auth:login-attempts:';
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  profile_image_url: string | null;
  created_at: string;
  auth_provider: 'password' | 'google';
}

export interface AccessTokenPrincipal {
  userId: string;
  expiresAt: number;
}

interface OAuthStateRecord {
  nonce: string;
  returnTo: string;
}

interface RefreshSessionRecord {
  userId: string;
  createdAt: string;
}

function registrationEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('INVALID_EMAIL', 400, 'A valid email address is required');
  }

  const email = normalizeEmail(value);
  if (!isValidEmail(email)) {
    throw new AppError('INVALID_EMAIL', 400, 'A valid email address is required');
  }
  return email;
}

function registrationPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new AppError(
      'INVALID_PASSWORD',
      400,
      'Password must be between 8 and 128 characters',
    );
  }
  return value;
}

function loginAttemptKey(email: string, clientKey: string): string {
  const fingerprint = createHash('sha256').update(`${clientKey}\0${email}`).digest('hex');
  return `${LOGIN_ATTEMPT_PREFIX}${fingerprint}`;
}

async function assertLoginAllowed(key: string): Promise<void> {
  const redis = await getRedisClient();
  const attempts = Number(await redis.get(key)) || 0;
  if (attempts >= LOGIN_ATTEMPT_LIMIT) {
    throw new AppError(
      'LOGIN_RATE_LIMITED',
      429,
      'Too many failed login attempts. Try again later.',
    );
  }
}

async function recordFailedLogin(key: string): Promise<void> {
  const redis = await getRedisClient();
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS);
}

export async function registerWithPassword(input: {
  name: unknown;
  email: unknown;
  password: unknown;
}): Promise<UserPublic> {
  const name = accountName(input.name);
  const email = registrationEmail(input.email);
  const password = registrationPassword(input.password);

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existingUser) {
    throw new AppError('EMAIL_ALREADY_REGISTERED', 409, 'This email is already registered');
  }

  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password_hash: passwordHash,
      },
    });
    return publicUser(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('EMAIL_ALREADY_REGISTERED', 409, 'This email is already registered');
    }
    throw error;
  }
}

export async function authenticateWithPassword(input: {
  email: unknown;
  password: unknown;
  clientKey: string;
}): Promise<UserPublic> {
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const password =
    typeof input.password === 'string' && input.password.length <= 128 ? input.password : '';
  const attemptKey = loginAttemptKey(email, input.clientKey);
  await assertLoginAllowed(attemptKey);

  const user = isValidEmail(email)
    ? await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      })
    : null;
  const passwordMatches = await verifyPassword(password, user?.password_hash ?? null);

  if (!user || !passwordMatches) {
    await recordFailedLogin(attemptKey);
    throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect');
  }

  const redis = await getRedisClient();
  await redis.del(attemptKey);
  return publicUser(user);
}

function publicUser(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profile_image_url: user.profile_image_url,
    created_at: user.created_at.toISOString(),
    auth_provider: user.password_hash === null ? 'google' : 'password',
  };
}

function stateKey(state: string): string {
  return `${OAUTH_STATE_PREFIX}${createHash('sha256').update(state).digest('hex')}`;
}

function refreshKey(token: string): string {
  return `${REFRESH_SESSION_PREFIX}${createHash('sha256').update(token).digest('hex')}`;
}

function userSessionsKey(userId: string): string {
  return `${USER_REFRESH_SESSIONS_PREFIX}${userId}`;
}

function signAccessToken(userId: string): string {
  return jwt.sign({}, config.jwtAccessSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: config.accessTokenTtlSeconds,
  });
}

export function verifyAccessTokenPrincipal(token: string): AccessTokenPrincipal {
  const payload = jwt.verify(token, config.jwtAccessSecret, {
    algorithms: ['HS256'],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  }) as JwtPayload;

  if (!payload.sub) throw new Error('Access token subject is missing');
  if (typeof payload.exp !== 'number') {
    throw new Error('Access token expiration is missing');
  }
  return {
    userId: payload.sub,
    expiresAt: payload.exp * 1_000,
  };
}

export function verifyAccessToken(token: string): string {
  return verifyAccessTokenPrincipal(token).userId;
}

export async function beginGoogleOAuth(returnToValue: unknown): Promise<{
  authorizationUrl: string;
  state: string;
}> {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const record: OAuthStateRecord = { nonce, returnTo: safeReturnTo(returnToValue) };
  const redis = await getRedisClient();

  await redis.set(stateKey(state), JSON.stringify(record), {
    EX: config.oauthStateTtlSeconds,
    NX: true,
  });

  return {
    state,
    authorizationUrl: googleClient.generateAuthUrl({
      access_type: 'online',
      include_granted_scopes: true,
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
    }),
  };
}

async function consumeOAuthState(
  queryState: string,
  cookieState: string | undefined,
): Promise<OAuthStateRecord> {
  if (!safeEqual(queryState, cookieState)) {
    throw new AppError('INVALID_OAUTH_STATE', 401, 'OAuth state did not match');
  }

  const redis = await getRedisClient();
  const raw = await redis.getDel(stateKey(queryState));
  if (!raw) {
    throw new AppError('EXPIRED_OAUTH_STATE', 401, 'OAuth state expired or was already used');
  }

  try {
    return JSON.parse(raw) as OAuthStateRecord;
  } catch {
    throw new AppError('INVALID_OAUTH_STATE', 401, 'Stored OAuth state was invalid');
  }
}

async function findOrCreateGoogleUser(payload: {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}): Promise<User> {
  const email = normalizeEmail(payload.email);

  return prisma.$transaction(async (tx) => {
    const account = await tx.oAuthAccount.findUnique({
      where: {
        provider_provider_id: {
          provider: 'google',
          provider_id: payload.sub,
        },
      },
      include: { user: true },
    });
    if (account) return account.user;

    const existingUser = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existingUser) {
      if (!config.autoLinkVerifiedEmail) {
        throw new AppError(
          'ACCOUNT_LINK_REQUIRED',
          409,
          'An account already exists for this email. Sign in with the existing method first.',
        );
      }

      await tx.oAuthAccount.create({
        data: {
          user_id: existingUser.id,
          provider: 'google',
          provider_id: payload.sub,
        },
      });
      return existingUser;
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
    });
  });
}

export async function completeGoogleOAuth(input: {
  code: string;
  state: string;
  stateCookie: string | undefined;
}): Promise<{ user: UserPublic; returnTo: string }> {
  const stateRecord = await consumeOAuthState(input.state, input.stateCookie);
  const tokenResponse = await googleClient.getToken(input.code);
  const idToken = tokenResponse.tokens.id_token;
  if (!idToken) {
    throw new AppError('MISSING_ID_TOKEN', 401, 'Google did not return an ID token');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new AppError(
      'INVALID_GOOGLE_IDENTITY',
      401,
      'Google account identity was incomplete or unverified',
    );
  }
  if (!safeEqual(payload.nonce, stateRecord.nonce)) {
    throw new AppError('INVALID_OAUTH_NONCE', 401, 'OAuth nonce did not match');
  }

  const user = await findOrCreateGoogleUser({
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  });

  return { user: publicUser(user), returnTo: stateRecord.returnTo };
}

export async function createSession(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const refreshToken = randomBytes(48).toString('base64url');
  const session: RefreshSessionRecord = {
    userId,
    createdAt: new Date().toISOString(),
  };
  const redis = await getRedisClient();
  const sessionKey = refreshKey(refreshToken);
  const indexKey = userSessionsKey(userId);
  await redis
    .multi()
    .set(sessionKey, JSON.stringify(session), { EX: config.refreshTokenTtlSeconds })
    .sAdd(indexKey, sessionKey)
    .expire(indexKey, config.refreshTokenTtlSeconds)
    .exec();

  return { accessToken: signAccessToken(userId), refreshToken };
}

export async function rotateSession(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}> {
  const redis = await getRedisClient();
  const oldSessionKey = refreshKey(refreshToken);
  const raw = await redis.getDel(oldSessionKey);
  if (!raw) {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh token is invalid or expired');
  }

  let session: RefreshSessionRecord;
  try {
    session = JSON.parse(raw) as RefreshSessionRecord;
  } catch {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh session was invalid');
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh session user no longer exists');
  }

  await redis.sRem(userSessionsKey(user.id), oldSessionKey);
  const newSession = await createSession(user.id);
  return { ...newSession, user: publicUser(user) };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const redis = await getRedisClient();
  const sessionKey = refreshKey(refreshToken);
  const raw = await redis.get(sessionKey);
  if (!raw) return;

  try {
    const session = JSON.parse(raw) as RefreshSessionRecord;
    await redis.multi().del(sessionKey).sRem(userSessionsKey(session.userId), sessionKey).exec();
  } catch {
    await redis.del(sessionKey);
  }
}

export async function getCurrentUser(userId: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User no longer exists');
  return publicUser(user);
}

export async function updateCurrentUser(userId: string, nameValue: unknown): Promise<UserPublic> {
  const name = accountName(nameValue);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { name },
  });
  return publicUser(user);
}

export async function deleteCurrentUser(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });

  const redis = await getRedisClient();
  const indexKey = userSessionsKey(userId);
  const sessionKeys = await redis.sMembers(indexKey);
  await redis.del([...sessionKeys, indexKey]);
}
