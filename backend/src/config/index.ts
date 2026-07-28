const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const DEFAULT_WS_AUTH_TIMEOUT_MS = 10_000;
const DEFAULT_WS_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_WS_MAX_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_WS_MAX_MESSAGES_PER_MINUTE = 120;

export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function booleanValue(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function normalizedOrigin(value: string): string {
  const url = new URL(value);
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_ORIGIN must contain only scheme, host, and optional port');
  }
  return url.origin;
}

function validateRedirectUri(value: string, nodeEnv: string): string {
  const url = new URL(value);
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(nodeEnv !== 'production' && isLocalhost)) {
    throw new Error('GOOGLE_REDIRECT_URI must use HTTPS outside local development');
  }
  return url.toString();
}

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const appOrigin = normalizedOrigin(required('APP_ORIGIN'));
const jwtAccessSecret = required('JWT_ACCESS_SECRET');

if (jwtAccessSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
}

export const config = {
  nodeEnv,
  port: positiveInteger('PORT', 3000),
  appOrigin,
  googleClientId: required('GOOGLE_CLIENT_ID'),
  googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: validateRedirectUri(required('GOOGLE_REDIRECT_URI'), nodeEnv),
  jwtAccessSecret,
  jwtIssuer: appOrigin,
  jwtAudience: 'ft-transcendence-web',
  accessTokenTtlSeconds: positiveInteger(
    'ACCESS_TOKEN_TTL_SECONDS',
    DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  ),
  refreshTokenTtlSeconds: positiveInteger(
    'REFRESH_TOKEN_TTL_SECONDS',
    DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  ),
  oauthStateTtlSeconds: positiveInteger(
    'OAUTH_STATE_TTL_SECONDS',
    DEFAULT_OAUTH_STATE_TTL_SECONDS,
  ),
  redisUrl: required('REDIS_URL'),
  cookieSecure: new URL(appOrigin).protocol === 'https:',
  autoLinkVerifiedEmail: booleanValue('OAUTH_AUTO_LINK_VERIFIED_EMAIL', false),
  smtp: {
    host: required('SMTP_HOST'),
    port: positiveInteger('SMTP_PORT', 587),
    user: required('SMTP_USER'),
    pass: required('SMTP_PASS'),
    from: required('SMTP_FROM'),
  },
  websocket: {
    path: '/ws',
    authTimeoutMs: positiveInteger('WS_AUTH_TIMEOUT_MS', DEFAULT_WS_AUTH_TIMEOUT_MS),
    heartbeatIntervalMs: positiveInteger(
      'WS_HEARTBEAT_INTERVAL_MS',
      DEFAULT_WS_HEARTBEAT_INTERVAL_MS,
    ),
    maxPayloadBytes: positiveInteger('WS_MAX_PAYLOAD_BYTES', DEFAULT_WS_MAX_PAYLOAD_BYTES),
    maxMessagesPerMinute: positiveInteger(
      'WS_MAX_MESSAGES_PER_MINUTE',
      DEFAULT_WS_MAX_MESSAGES_PER_MINUTE,
    ),
  },
} as const;
