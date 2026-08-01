import { createHash, randomBytes } from 'node:crypto'
import type { Role } from '@prisma/client'
import { getRedisClient } from './redis'

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60
const INVITE_KEY_PREFIX = 'workspace:invite:'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export interface WorkspaceInvitation {
  workspaceId: string
  role: Exclude<Role, 'OWNER'>
  deliveryEmail: string
  createdBy: string
}

function invitationKey(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null
  const digest = createHash('sha256').update(token).digest('hex')
  return `${INVITE_KEY_PREFIX}${digest}`
}

function parseInvitation(raw: string): WorkspaceInvitation | null {
  try {
    const value = JSON.parse(raw) as Partial<WorkspaceInvitation>
    if (
      typeof value.workspaceId !== 'string' ||
      !['ADMIN', 'MEMBER', 'VIEWER'].includes(value.role ?? '') ||
      typeof value.deliveryEmail !== 'string' ||
      typeof value.createdBy !== 'string'
    ) {
      return null
    }
    return value as WorkspaceInvitation
  } catch {
    return null
  }
}

async function create(input: WorkspaceInvitation): Promise<string> {
  const redis = await getRedisClient()

  for (;;) {
    const token = randomBytes(32).toString('base64url')
    const key = invitationKey(token)!
    const created = await redis.set(key, JSON.stringify(input), {
      EX: INVITE_TTL_SECONDS,
      NX: true,
    })
    if (created === 'OK') return token
  }
}

async function preview(token: string): Promise<WorkspaceInvitation | null> {
  const key = invitationKey(token)
  if (!key) return null

  const redis = await getRedisClient()
  const raw = await redis.get(key)
  return raw ? parseInvitation(raw) : null
}

async function take(token: string): Promise<WorkspaceInvitation | null> {
  const key = invitationKey(token)
  if (!key) return null

  const redis = await getRedisClient()
  const raw = await redis.getDel(key)
  return raw ? parseInvitation(raw) : null
}

async function discard(token: string): Promise<void> {
  const key = invitationKey(token)
  if (!key) return
  const redis = await getRedisClient()
  await redis.del(key)
}

export const workspaceInvitationStore = {
  create,
  preview,
  take,
  discard,
}
