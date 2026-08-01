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
  status: 'available' | 'claimed'
  claimedBy: string | null
}

type LookupResult =
  | { status: 'available'; invitation: WorkspaceInvitation }
  | { status: 'missing' }
  | { status: 'claimed' }

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0} end
local ok, invitation = pcall(cjson.decode, raw)
if not ok then
  redis.call('DEL', KEYS[1])
  return {0}
end
if invitation.status == 'available' then
  invitation.status = 'claimed'
  invitation.claimedBy = ARGV[1]
  local claimed = cjson.encode(invitation)
  redis.call('SET', KEYS[1], claimed, 'KEEPTTL')
  return {1, claimed}
end
if invitation.status == 'claimed' and invitation.claimedBy == ARGV[1] then
  return {1, raw}
end
return {2}
`

const CONSUME_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, invitation = pcall(cjson.decode, raw)
if not ok then
  redis.call('DEL', KEYS[1])
  return 0
end
if invitation.status ~= 'claimed' or invitation.claimedBy ~= ARGV[1] then
  return 0
end
return redis.call('DEL', KEYS[1])
`

const DISCARD_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, invitation = pcall(cjson.decode, raw)
if not ok then
  redis.call('DEL', KEYS[1])
  return 0
end
if invitation.status ~= 'available' then return 0 end
return redis.call('DEL', KEYS[1])
`

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
      typeof value.createdBy !== 'string' ||
      !['available', 'claimed'].includes(value.status ?? '') ||
      (value.claimedBy !== null && typeof value.claimedBy !== 'string')
    ) {
      return null
    }
    return value as WorkspaceInvitation
  } catch {
    return null
  }
}

async function create(
  input: Omit<WorkspaceInvitation, 'status' | 'claimedBy'>,
): Promise<string> {
  const redis = await getRedisClient()
  const invitation: WorkspaceInvitation = {
    ...input,
    status: 'available',
    claimedBy: null,
  }

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

async function preview(token: string, userId: string): Promise<LookupResult> {
  const key = invitationKey(token)
  if (!key) return { status: 'missing' }

  const redis = await getRedisClient()
  const raw = await redis.get(key)
  if (!raw) return { status: 'missing' }
  const invitation = parseInvitation(raw)
  if (!invitation) return { status: 'missing' }
  if (invitation.status === 'claimed' && invitation.claimedBy !== userId) {
    return { status: 'claimed' }
  }
  return { status: 'available', invitation }
}

async function claim(token: string, userId: string): Promise<LookupResult> {
  const key = invitationKey(token)
  if (!key) return { status: 'missing' }

  const redis = await getRedisClient()
  const result = (await redis.eval(CLAIM_SCRIPT, {
    keys: [key],
    arguments: [userId],
  })) as unknown[]
  const code = Number(result[0])
  if (code === 0) return { status: 'missing' }
  if (code === 2) return { status: 'claimed' }
  const invitation =
    typeof result[1] === 'string' ? parseInvitation(result[1]) : null
  return invitation
    ? { status: 'available', invitation }
    : { status: 'missing' }
}

async function consume(token: string, userId: string): Promise<boolean> {
  const key = invitationKey(token)
  if (!key) return false
  const redis = await getRedisClient()
  return (
    Number(
      await redis.eval(CONSUME_SCRIPT, {
        keys: [key],
        arguments: [userId],
      }),
    ) === 1
  )
}

async function discard(token: string): Promise<void> {
  const key = invitationKey(token)
  if (!key) return
  const redis = await getRedisClient()
  await redis.eval(DISCARD_SCRIPT, { keys: [key], arguments: [] })
}

export const workspaceInvitationStore = {
  create,
  preview,
  claim,
  consume,
  discard,
}
