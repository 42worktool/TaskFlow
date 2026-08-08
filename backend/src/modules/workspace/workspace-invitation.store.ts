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

// 초대 본문은 만료 가능한 Redis 값으로 두고, 워크스페이스별 키 인덱스를 별도로 둔다.
// 워크스페이스 삭제 시 아직 사용되지 않은 초대를 한 번에 폐기하기 위한 구조다.

function invitationIndexKey(workspaceId: string): string {
  return `${INVITE_INDEX_KEY_PREFIX}${workspaceId}`
}

function invitationKey(token: string): string | null {
  const parsed = workspaceInvitationTokenSchema.safeParse(token)
  if (!parsed.success) return null
  // URL에 전달되는 원본 토큰은 Redis 키에 저장하지 않아 저장소 노출 시 바로 사용할 수 없게 한다.
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
  // 인덱스 정리는 보조 작업이므로 실패해도 이미 소비된 초대의 본 처리까지 실패시키지 않는다.
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
    // NX 저장이 충돌하면 새 난수를 만들어 재시도해 기존 초대를 덮어쓰지 않는다.
    const token = randomBytes(32).toString('base64url')
    const key = invitationKey(token)!
    const created = await redis.set(key, JSON.stringify(invitation), {
      EX: INVITE_TTL_SECONDS,
      NX: true,
    })
    if (created !== 'OK') continue

    const indexKey = invitationIndexKey(invitation.workspaceId)
    try {
      await redis.multi().sAdd(indexKey, key).expire(indexKey, INVITE_TTL_SECONDS).exec()
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
  // 조회와 삭제를 원자적으로 묶어 동시에 수락해도 한 요청만 초대를 소비한다.
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
