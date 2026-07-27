import { createHash, randomBytes } from 'node:crypto'
import type { Role } from '@prisma/client'
import { getRedisClient } from './redis'

const INVITE_KEY_PREFIX = 'workspace:invite:'
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60
const INVITE_TOKEN_BYTES = 32
const INVITE_TOKEN_ATTEMPTS = 3
const INVITE_ROLES = new Set<Role>(['ADMIN', 'MEMBER', 'VIEWER'])

export interface WorkspaceInviteRecord {
  workspaceId: string
  email: string
  role: Exclude<Role, 'OWNER'>
  invitedByUserId: string
}

interface InviteRedis {
  set(
    key: string,
    value: string,
    options: { EX: number; NX: true },
  ): Promise<string | null>
  get(key: string): Promise<string | null>
  getDel(key: string): Promise<string | null>
}

function inviteKey(token: string): string {
  const digest = createHash('sha256').update(token).digest('hex')
  return `${INVITE_KEY_PREFIX}${digest}`
}

function parseInviteRecord(raw: string | null): WorkspaceInviteRecord | null {
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as Partial<WorkspaceInviteRecord>
    if (
      typeof value.workspaceId !== 'string'
      || typeof value.email !== 'string'
      || typeof value.invitedByUserId !== 'string'
      || !INVITE_ROLES.has(value.role as Role)
    ) {
      return null
    }
    return value as WorkspaceInviteRecord
  } catch {
    return null
  }
}

export async function createWorkspaceInvite(
  record: WorkspaceInviteRecord,
  redisClient?: InviteRedis,
): Promise<string> {
  const redis = redisClient ?? await getRedisClient()

  for (let attempt = 0; attempt < INVITE_TOKEN_ATTEMPTS; attempt += 1) {
    const token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url')
    const result = await redis.set(inviteKey(token), JSON.stringify(record), {
      EX: INVITE_TTL_SECONDS,
      NX: true,
    })
    if (result === 'OK') return token
  }

  throw new Error('Failed to allocate a unique workspace invitation token')
}

export async function readWorkspaceInvite(
  token: string,
  options: { consume?: boolean; redisClient?: InviteRedis } = {},
): Promise<WorkspaceInviteRecord | null> {
  const redis = options.redisClient ?? await getRedisClient()
  const raw = options.consume
    ? await redis.getDel(inviteKey(token))
    : await redis.get(inviteKey(token))
  return parseInviteRecord(raw)
}
