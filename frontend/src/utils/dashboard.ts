// 서버의 일별 활동 집계를 GitHub 잔디 형태의 7일 열 그리드로 가공한다.
import type { DashboardDailyActivity } from '../types'

export interface ContributionCell {
  key: string
  date: string | null
  count: number
  logCount: number
  placeholder: boolean
}

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export function contributionLevel(count: number, maximum: number): number {
  // 기간 내 최댓값을 네 단계로 정규화해 데이터 규모가 달라도 색 대비를 유지한다.
  if (count <= 0 || maximum <= 0) return 0
  return Math.max(1, Math.min(4, Math.ceil((count / maximum) * 4)))
}

export function buildContributionCells(
  days: readonly DashboardDailyActivity[],
): ContributionCell[] {
  if (days.length === 0) return []

  // 시작·끝에 빈 칸을 채워 배열을 항상 일요일 시작의 완전한 주 단위로 만든다.
  const leading = parseUtcDate(days[0].date).getUTCDay()
  const cells: ContributionCell[] = Array.from({ length: leading }, (_, index) => ({
    key: `leading-${index}`,
    date: null,
    count: 0,
    logCount: 0,
    placeholder: true,
  }))

  days.forEach((day) => {
    cells.push({
      key: day.date,
      date: day.date,
      count: day.count,
      logCount: day.log_count,
      placeholder: false,
    })
  })

  const trailing = (7 - (cells.length % 7)) % 7
  for (let index = 0; index < trailing; index += 1) {
    cells.push({
      key: `trailing-${index}`,
      date: null,
      count: 0,
      logCount: 0,
      placeholder: true,
    })
  }

  return cells
}

export function formatDashboardDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parseUtcDate(value))
}
