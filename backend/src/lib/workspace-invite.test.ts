import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkspaceInviteRecord } from './workspace-invite'
import { setRequiredEnvironment } from '../test/helpers'

setRequiredEnvironment()

const inviteModule = import('./workspace-invite')

function makeRedis() {
  const values = new Map<string, string>()
  let lastSet: { key: string; options: unknown } | undefined

  return {
    client: {
      async set(key: string, value: string, options: { EX: number; NX: true }) {
        lastSet = { key, options }
        if (values.has(key)) return null
        values.set(key, value)
        return 'OK'
      },
      async get(key: string) {
        return values.get(key) ?? null
      },
      async getDel(key: string) {
        const value = values.get(key) ?? null
        values.delete(key)
        return value
      },
    },
    lastSet: () => lastSet,
  }
}

const invite: WorkspaceInviteRecord = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.com',
  role: 'MEMBER',
  invitedByUserId: '00000000-0000-4000-8000-000000000002',
}

test('workspace invitations use opaque hashed Redis keys with a seven-day TTL', async () => {
  const { createWorkspaceInvite, readWorkspaceInvite } = await inviteModule
  const redis = makeRedis()
  const token = await createWorkspaceInvite(invite, redis.client)
  const stored = redis.lastSet()

  assert.ok(token.length >= 40)
  assert.ok(stored?.key.startsWith('workspace:invite:'))
  assert.ok(!stored?.key.includes(token))
  assert.deepEqual(stored?.options, { EX: 7 * 24 * 60 * 60, NX: true })
  assert.deepEqual(
    await readWorkspaceInvite(token, { redisClient: redis.client }),
    invite,
  )
})

test('workspace invitations are consumed only once', async () => {
  const {
    createWorkspaceInvite,
    readWorkspaceInvite,
  } = await inviteModule
  const redis = makeRedis()
  const token = await createWorkspaceInvite(invite, redis.client)

  assert.deepEqual(
    await readWorkspaceInvite(token, { consume: true, redisClient: redis.client }),
    invite,
  )
  assert.equal(
    await readWorkspaceInvite(token, { consume: true, redisClient: redis.client }),
    null,
  )
  assert.equal(
    await readWorkspaceInvite(token, { redisClient: redis.client }),
    null,
  )
})
