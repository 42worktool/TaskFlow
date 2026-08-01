import { z } from 'zod'
import { prisma } from '../../db'
import { uuidSchema } from '../../lib/validation'
import {
  realtime,
  type RealtimeConnectionDisconnectedInfo,
  type RealtimeConnectionInfo,
} from '../../realtime'
import {
  addPresenceConnection,
  clearPresence,
  isUserOnline,
  removePresenceConnection,
} from './presence.state'
import { otherUserId } from '../friend/friend-pair'
import { publishWorkspacePresenceChanged } from '../workspace/workspace.realtime'

export const friendPresenceEventSchema = z
  .object({
    user_id: uuidSchema,
    online: z.boolean(),
  })
  .strict()

const DEFAULT_DRAIN_TIMEOUT_MS = 5_000

let running = false
let stopped = false
let currentStop: (() => Promise<void>) | null = null
const pendingNotifications = new Set<Promise<void>>()

async function drainPendingNotifications(timeoutMs: number): Promise<void> {
  const tasks = [...pendingNotifications]
  if (tasks.length === 0) return

  let timer: NodeJS.Timeout | null = null
  const result = await Promise.race([
    Promise.allSettled(tasks).then(() => 'drained' as const),
    new Promise<'timed_out'>((resolve) => {
      timer = setTimeout(() => resolve('timed_out'), timeoutMs)
    }),
  ])
  if (timer) clearTimeout(timer)
  if (result === 'timed_out') {
    console.warn(`[presence] notification drain exceeded ${timeoutMs}ms`)
  }
}

async function notifyPresence(userId: string, online: boolean): Promise<void> {
  const [friendships, memberships] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [
          { user_low_id: userId },
          { user_high_id: userId },
        ],
      },
      select: {
        user_low_id: true,
        user_high_id: true,
      },
    }),
    prisma.workspaceMember.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        workspace: { deleted_at: null },
      },
      select: { workspace_id: true },
    }),
  ])

  if (!running || isUserOnline(userId) !== online) return

  const event = friendPresenceEventSchema.parse({
    user_id: userId,
    online,
  })
  const friendIds = new Set(
    friendships.map((friendship) => otherUserId(friendship, userId)),
  )

  realtime.sendToUsers(friendIds, 'friend.presence_changed', event)
  for (const workspaceId of new Set(
    memberships.map((membership) => membership.workspace_id),
  )) {
    publishWorkspacePresenceChanged({
      workspace_id: workspaceId,
      user_id: userId,
      online,
    })
  }
}

function schedulePresenceNotification(userId: string, online: boolean): void {
  let task: Promise<void>
  task = notifyPresence(userId, online)
    .catch((error: unknown) => {
      console.error(
        '[presence] notification failed',
        error instanceof Error ? error.message : error,
      )
    })
    .finally(() => pendingNotifications.delete(task))
  pendingNotifications.add(task)
}

function connectionAuthenticated(
  connection: Readonly<RealtimeConnectionInfo>,
): void {
  if (!running) return
  if (addPresenceConnection(connection.userId, connection.connectionId)) {
    schedulePresenceNotification(connection.userId, true)
  }
}

function connectionDisconnected(
  connection: Readonly<RealtimeConnectionDisconnectedInfo>,
): void {
  if (!running) return
  if (removePresenceConnection(connection.userId, connection.connectionId)) {
    schedulePresenceNotification(connection.userId, false)
  }
}

export function startPresence(
  options: { drainTimeoutMs?: number } = {},
): () => Promise<void> {
  if (stopped) {
    throw new Error('Presence service cannot be restarted')
  }
  if (currentStop) return currentStop

  running = true
  const removeAuthenticated =
    realtime.onConnectionAuthenticated(connectionAuthenticated)
  const removeDisconnected =
    realtime.onConnectionDisconnected(connectionDisconnected)

  let stopPromise: Promise<void> | null = null
  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise
    running = false
    stopped = true
    removeAuthenticated()
    removeDisconnected()
    clearPresence()
    currentStop = null
    stopPromise = drainPendingNotifications(
      options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS,
    )
    return stopPromise
  }
  currentStop = stop
  return stop
}
