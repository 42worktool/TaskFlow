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

// 이 프로토타입은 API 프로세스가 하나이므로 작은 메모리 revision만으로
// 권한 조회와 채널 참여 사이의 경쟁을 막는다. 권한을 바꾸는 DB 쓰기가 커밋된 뒤
// revision을 올리며, 다중 인스턴스로 확장할 때는 공유 저장소 방식으로 교체해야 한다.
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
  // 실시간 전송 실패가 이미 커밋된 비즈니스 작업을 되돌려서는 안 되므로
  // 검증/전송 오류만 기록한다. 해당 이벤트는 유실될 수 있으며 이후 별도 API 조회나
  // 다른 동기화 계기가 있어야 현재 상태를 다시 맞출 수 있다.
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
      // DB 권한 조회 전후 revision이 같을 때만 채널에 들어가게 해,
      // 조회 직후 멤버가 제거되는 TOCTOU 경쟁을 차단한다.
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

      // 채널 참여 후 최신 조회로 ack를 만든다. 이 조회 중 권한이 회수되면 revision을
      // 다시 확인해 오래된 구독을 승인하지 않고 즉시 채널에서 나간다.
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
