import { createHash, randomBytes } from 'node:crypto'
import { getRedisClient } from '../../lib/redis'
import {
  workspaceInvitationSchema,
  workspaceInvitationTokenSchema,
  type WorkspaceInvitation,
} from './workspace.validation'

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60
const INVITE_KEY_PREFIX = 'workspace:invite:'

function invitationKey(token: string): string | null {
  const parsed = workspaceInvitationTokenSchema.safeParse(token)
  if (!parsed.success) return null
  const digest = createHash('sha256').update(parsed.data).digest('hex')
  return `${INVITE_KEY_PREFIX}${digest}`
}

function parseInvitation(raw: string): WorkspaceInvitation | null {
  try {
    const parsed = workspaceInvitationSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function create(input: WorkspaceInvitation): Promise<string> {
  const redis = await getRedisClient()
  const invitation = workspaceInvitationSchema.parse(input)

  for (;;) {
    const token = randomBytes(32).toString('base64url')
    const key = invitationKey(token)!
    const created = await redis.set(key, JSON.stringify(invitation), {
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
