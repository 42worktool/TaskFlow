import type { ActivityTargetType } from '@prisma/client'
import { prisma } from '../../db'
import { userSummarySelect } from '../../lib/user-summary'
import { requireWorkspaceReadAccess } from '../../lib/workspace-permissions'

const DAY_MS = 24 * 60 * 60 * 1000

const TARGET_TYPES: ActivityTargetType[] = ['WORKSPACE', 'MEMBER', 'LIST', 'CARD', 'COMMENT']

// 대시보드는 원본 활동 로그와 현재 카드 상태를 응답 시점에 집계한다.
// 별도 통계 테이블을 두지 않아 프로토타입의 쓰기 경로를 단순하게 유지한다.

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS)
}

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function roundPercentage(done: number, total: number): number {
  if (total === 0) return 0
  return Math.round((done / total) * 1000) / 10
}

export async function getWorkspaceDashboard(input: {
  userId: string
  workspaceId: string
  periodDays: 7 | 30 | 90 | 365
  now?: Date
}) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: input.workspaceId, deleted_at: null },
    select: {
      is_public: true,
      members: {
        where: { user_id: input.userId, deleted_at: null },
        select: { user_id: true },
      },
    },
  })
  requireWorkspaceReadAccess(workspace, input.userId)

  const generatedAt = input.now ?? new Date()
  const today = startOfUtcDay(generatedAt)
  const periodStart = addUtcDays(today, -(input.periodDays - 1))
  const tomorrow = addUtcDays(today, 1)

  // 기간 활동과 현재 보드 상태는 독립적이므로 병렬로 조회한다.
  const [logs, lists] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        workspace_id: input.workspaceId,
        event_type: { not: 'WORKSPACE_CREATED' },
        created_at: {
          gte: periodStart,
          lt: tomorrow,
        },
      },
      orderBy: { created_at: 'desc' },
      select: {
        actor_user_id: true,
        operation: true,
        event_type: true,
        target_type: true,
        target_id: true,
        transaction_id: true,
        created_at: true,
      },
    }),
    prisma.list.findMany({
      where: {
        workspace_id: input.workspaceId,
        deleted_at: null,
        workspace: { deleted_at: null },
      },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        name: true,
        cards: {
          where: { deleted_at: null },
          select: {
            is_completed: true,
          },
        },
      },
    }),
  ])

  const activityByDate = new Map<string, { transactions: Set<string>; logCount: number }>()
  const flowByDate = new Map<string, { created: number; completed: number; reopened: number }>()
  const breakdown = new Map<ActivityTargetType, number>(
    TARGET_TYPES.map((targetType) => [targetType, 0]),
  )
  const periodTransactions = new Set<string>()
  let createdInPeriod = 0
  let completedInPeriod = 0
  let reopenedInPeriod = 0

  // 한 비즈니스 동작이 여러 DB trigger 로그를 만들 수 있어 transaction_id 기준의
  // 활동 수와 실제 로그 수를 따로 계산한다.
  for (const log of logs) {
    const date = utcDateKey(log.created_at)
    const activity = activityByDate.get(date) ?? {
      transactions: new Set<string>(),
      logCount: 0,
    }
    activity.transactions.add(log.transaction_id.toString())
    activity.logCount += 1
    activityByDate.set(date, activity)
    breakdown.set(log.target_type, (breakdown.get(log.target_type) ?? 0) + 1)

    periodTransactions.add(log.transaction_id.toString())
    const flow = flowByDate.get(date) ?? {
      created: 0,
      completed: 0,
      reopened: 0,
    }
    if (log.event_type === 'CARD_CREATED') {
      createdInPeriod += 1
      flow.created += 1
    } else if (log.event_type === 'CARD_COMPLETED') {
      completedInPeriod += 1
      flow.completed += 1
    } else if (log.event_type === 'CARD_REOPENED') {
      reopenedInPeriod += 1
      flow.reopened += 1
    }
    flowByDate.set(date, flow)
  }

  // 최근 활동에 표시할 사용자만 추가 조회해 전체 기간의 actor를 불필요하게 불러오지 않는다.
  const recentLogs = logs.slice(0, 50)
  const actorIds = Array.from(
    new Set(
      recentLogs
        .map((log) => log.actor_user_id)
        .filter((actorId): actorId is string => actorId !== null),
    ),
  )
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: actorIds },
          deleted_at: null,
        },
        select: userSummarySelect,
      })
    : []
  const actorById = new Map(actors.map((actor) => [actor.id, actor]))

  const listSummaries = lists.map((list) => ({
    list_id: list.id,
    name: list.name,
    card_count: list.cards.length,
    completed_card_count: list.cards.filter((card) => card.is_completed).length,
  }))
  const currentTotal = listSummaries.reduce((total, list) => total + list.card_count, 0)
  const currentDone = listSummaries.reduce((total, list) => total + list.completed_card_count, 0)

  return {
    generated_at: generatedAt.toISOString(),
    period_days: input.periodDays,
    summary: {
      current_total: currentTotal,
      current_done: currentDone,
      current_not_done: currentTotal - currentDone,
      created_in_period: createdInPeriod,
      completed_in_period: completedInPeriod,
      reopened_in_period: reopenedInPeriod,
      completion_rate: roundPercentage(currentDone, currentTotal),
      has_cards: currentTotal > 0,
      activity_in_period: periodTransactions.size,
    },
    daily_activity: Array.from({ length: input.periodDays }, (_, index) => {
      const date = utcDateKey(addUtcDays(periodStart, index))
      const activity = activityByDate.get(date)
      return {
        date,
        count: activity?.transactions.size ?? 0,
        log_count: activity?.logCount ?? 0,
      }
    }),
    daily_flow: Array.from({ length: input.periodDays }, (_, index) => {
      const date = utcDateKey(addUtcDays(periodStart, index))
      return {
        date,
        ...(flowByDate.get(date) ?? {
          created: 0,
          completed: 0,
          reopened: 0,
        }),
      }
    }),
    lists: listSummaries,
    activity_breakdown: TARGET_TYPES.map((targetType) => ({
      target_type: targetType,
      count: breakdown.get(targetType) ?? 0,
    })),
    recent_activity: recentLogs.map((log) => {
      const actor = log.actor_user_id ? actorById.get(log.actor_user_id) : undefined
      return {
        event_type: log.event_type,
        target_type: log.target_type,
        operation: log.operation,
        target_id: log.target_id,
        created_at: log.created_at.toISOString(),
        actor: actor
          ? {
              user_id: actor.id,
              name: actor.name,
              profile_image_url: actor.profile_image_url,
            }
          : null,
      }
    }),
  }
}
