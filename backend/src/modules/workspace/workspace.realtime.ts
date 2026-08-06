import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../../db'
import { uuidSchema } from '../../lib/validation'
import { realtime, RealtimeError } from '../../realtime'
import { isUserOnline } from '../presence/presence.state'

const workspaceSubscriptionSchema = z
  .object({
    workspace_id: uuidSchema,
  })
  .strict()

const workspaceChangeEventSchema = z
  .object({
    event_id: uuidSchema,
    workspace_id: uuidSchema,
    entity: z.enum(['workspace', 'member', 'list', 'card']),
    action: z.enum(['created', 'updated', 'deleted', 'moved']),
    entity_id: uuidSchema,
    list_ids: z.array(uuidSchema).max(2),
    actor_user_id: uuidSchema,
    occurred_at: z.string().datetime(),
  })
  .strict()

const workspacePresenceEventSchema = z
  .object({
    workspace_id: uuidSchema,
    user_id: uuidSchema,
    online: z.boolean(),
  })
  .strict()

export type WorkspaceChangeEvent = z.infer<typeof workspaceChangeEventSchema>
export type WorkspacePresenceEvent = z.infer<typeof workspacePresenceEventSchema>

type WorkspaceChangeInput = Omit<WorkspaceChangeEvent, 'event_id' | 'occurred_at'>

// This prototype runs one API process, so small in-memory revisions are enough
// to close the authorization-query -> channel-join race without adding a
// distributed lock. Mutations advance these only after their DB write commits.
const workspaceAccessRevisions = new Map<string, number>()
const memberAccessRevisions = new Map<string, number>()

interface WorkspaceAccessSnapshot {
  workspace: number
  member: number
}

function memberAccessKey(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`
}

function currentRevision(revisions: Map<string, number>, key: string): number {
  return revisions.get(key) ?? 0
}

function advanceRevision(revisions: Map<string, number>, key: string): void {
  revisions.set(key, currentRevision(revisions, key) + 1)
}

function captureWorkspaceAccess(workspaceId: string, userId: string): WorkspaceAccessSnapshot {
  return {
    workspace: currentRevision(workspaceAccessRevisions, workspaceId),
    member: currentRevision(memberAccessRevisions, memberAccessKey(workspaceId, userId)),
  }
}

function workspaceAccessIsCurrent(
  workspaceId: string,
  userId: string,
  snapshot: WorkspaceAccessSnapshot,
): boolean {
  const current = captureWorkspaceAccess(workspaceId, userId)
  return current.workspace === snapshot.workspace && current.member === snapshot.member
}

export function revokeWorkspaceMemberAccess(workspaceId: string, userId: string): void {
  advanceRevision(memberAccessRevisions, memberAccessKey(workspaceId, userId))
}

export function revokeWorkspaceAccess(workspaceId: string): void {
  advanceRevision(workspaceAccessRevisions, workspaceId)
}

export function workspaceChannel(workspaceId: string): string {
  return `workspace:${workspaceId}`
}

function reportPublishFailure(event: string, error: unknown): void {
  console.warn(
    `[realtime] failed to publish "${event}"`,
    error instanceof Error ? error.message : error,
  )
}

export function publishWorkspaceChange(input: WorkspaceChangeInput): WorkspaceChangeEvent | null {
  let event: WorkspaceChangeEvent
  try {
    event = workspaceChangeEventSchema.parse({
      ...input,
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
    })
  } catch (error) {
    reportPublishFailure('workspace.changed', error)
    return null
  }

  try {
    realtime.publish(workspaceChannel(event.workspace_id), 'workspace.changed', event)
  } catch (error) {
    reportPublishFailure('workspace.changed', error)
  }
  return event
}

export function publishWorkspacePresenceChanged(
  input: WorkspacePresenceEvent,
): WorkspacePresenceEvent | null {
  let event: WorkspacePresenceEvent
  try {
    event = workspacePresenceEventSchema.parse(input)
  } catch (error) {
    reportPublishFailure('workspace.member_presence_changed', error)
    return null
  }

  try {
    realtime.publish(
      workspaceChannel(event.workspace_id),
      'workspace.member_presence_changed',
      event,
    )
  } catch (error) {
    reportPublishFailure('workspace.member_presence_changed', error)
  }
  return event
}

let stopCurrentRegistration: (() => void) | null = null

export function startWorkspaceRealtime(): () => void {
  if (stopCurrentRegistration) return stopCurrentRegistration

  const removeSubscribe = realtime.register(
    'workspace.subscribe',
    workspaceSubscriptionSchema,
    async (context, { workspace_id }) => {
      const accessSnapshot = captureWorkspaceAccess(workspace_id, context.userId)
      const authorizedWorkspace = await prisma.workspace.findFirst({
        where: {
          id: workspace_id,
          deleted_at: null,
          members: {
            some: {
              user_id: context.userId,
              deleted_at: null,
            },
          },
        },
        select: { id: true },
      })
      if (!authorizedWorkspace) {
        throw new RealtimeError(
          'WORKSPACE_ACCESS_REQUIRED',
          'Active workspace membership is required',
        )
      }
      if (!workspaceAccessIsCurrent(workspace_id, context.userId, accessSnapshot)) {
        throw new RealtimeError(
          'WORKSPACE_SUBSCRIPTION_CHANGED',
          'Workspace access changed while subscribing',
          true,
        )
      }

      context.join(workspaceChannel(workspace_id))

      // Build the acknowledgement from a fresh post-join query. If access is
      // revoked while that query is in flight, the revision check also makes
      // the handler leave instead of acknowledging a stale subscription.
      const finalAccessSnapshot = captureWorkspaceAccess(workspace_id, context.userId)
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: workspace_id,
          deleted_at: null,
          members: {
            some: {
              user_id: context.userId,
              deleted_at: null,
            },
          },
        },
        select: {
          members: {
            where: { deleted_at: null },
            select: { user_id: true },
          },
        },
      })

      if (!workspace) {
        context.leave(workspaceChannel(workspace_id))
        throw new RealtimeError(
          'WORKSPACE_ACCESS_REQUIRED',
          'Active workspace membership is required',
        )
      }
      if (!workspaceAccessIsCurrent(workspace_id, context.userId, finalAccessSnapshot)) {
        context.leave(workspaceChannel(workspace_id))
        throw new RealtimeError(
          'WORKSPACE_SUBSCRIPTION_CHANGED',
          'Workspace access changed while subscribing',
          true,
        )
      }

      return {
        workspace_id,
        online_user_ids: workspace.members.map((member) => member.user_id).filter(isUserOnline),
      }
    },
  )

  const removeUnsubscribe = realtime.register(
    'workspace.unsubscribe',
    workspaceSubscriptionSchema,
    (context, { workspace_id }) => {
      context.leave(workspaceChannel(workspace_id))
      return { workspace_id }
    },
  )

  const stop = (): void => {
    if (stopCurrentRegistration !== stop) return
    removeSubscribe()
    removeUnsubscribe()
    stopCurrentRegistration = null
  }
  stopCurrentRegistration = stop
  return stop
}
