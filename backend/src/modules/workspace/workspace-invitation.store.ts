import { createHash, randomBytes } from 'node:crypto'
import { getRedisClient } from '../../lib/redis'
import {
  workspaceInvitationSchema,
  workspaceInvitationTokenSchema,
  type WorkspaceInvitation,
} from './workspace.validation'

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60
const INVITE_KEY_PREFIX = 'workspace:invite:'
const INVITE_INDEX_KEY_PREFIX = 'workspace:invite:index:'

function invitationIndexKey(workspaceId: string): string {
  return `${INVITE_INDEX_KEY_PREFIX}${workspaceId}`
}

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

async function removeFromIndex(
  redis: Awaited<ReturnType<typeof getRedisClient>>,
  invitation: WorkspaceInvitation,
  key: string,
): Promise<void> {
  try {
    await redis.sRem(invitationIndexKey(invitation.workspaceId), key)
  } catch (error) {
    console.error(
      '[workspace-invitation] failed to clean invitation index',
      error instanceof Error ? error.message : error,
    )
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
    if (created !== 'OK') continue

    const indexKey = invitationIndexKey(invitation.workspaceId)
    try {
      await redis
        .multi()
        .sAdd(indexKey, key)
        .expire(indexKey, INVITE_TTL_SECONDS)
        .exec()
      return token
    } catch (error) {
      await redis.del(key)
      throw error
    }
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
  if (!raw) return null

  const invitation = parseInvitation(raw)
  if (invitation) {
    await removeFromIndex(redis, invitation, key)
  }
  return invitation
}

async function discard(token: string): Promise<void> {
  const key = invitationKey(token)
  if (!key) return

  const redis = await getRedisClient()
  const raw = await redis.getDel(key)
  if (!raw) return

  const invitation = parseInvitation(raw)
  if (invitation) {
    await removeFromIndex(redis, invitation, key)
  }
}

async function discardWorkspace(workspaceId: string): Promise<void> {
  const redis = await getRedisClient()
  const indexKey = invitationIndexKey(workspaceId)
  const invitationKeys = await redis.sMembers(indexKey)
  await redis.del([...invitationKeys, indexKey])
}

export const workspaceInvitationStore = {
  create,
  preview,
  take,
  discard,
  discardWorkspace,
}
