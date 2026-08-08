// 카드의 시작일·마감일을 월간 달력의 주별 막대와 겹침 lane으로 변환한다.
import type { Card } from '../types'

function localDay(value: string | Date): number | null {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

interface CardDateRange {
  start: number
  end: number
}

interface CalendarDay {
  date: number | null
  day: number | null
}

export interface CalendarRangeSegment {
  card: Card
  startColumn: number
  endColumn: number
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface CalendarWeek {
  days: CalendarDay[]
  segments: CalendarRangeSegment[]
  laneCount: number
}

function cardDateRange(card: Card): CardDateRange | null {
  const start = card.start_at ? localDay(card.start_at) : null
  const deadline = card.deadline ? localDay(card.deadline) : null
  const firstDay = start ?? deadline
  const lastDay = deadline ?? start

  if (firstDay === null || lastDay === null || firstDay > lastDay) {
    return null
  }
  return { start: firstDay, end: lastDay }
}

/**
 * 카드 화면과 같은 날짜가 보이도록 브라우저의 로컬 날짜를 기준으로 판단한다.
 * 시작일이나 마감일 하나만 있으면 하루 일정, 둘 다 있으면 양 끝을 포함한 기간이다.
 */
export function cardOccursOnDate(card: Card, date: Date): boolean {
  const day = localDay(date)
  const range = cardDateRange(card)

  return day !== null && range !== null && range.start <= day && day <= range.end
}

/**
 * 월을 주 행으로 나누고 겹치는 카드 기간은 서로 다른 lane에 배치한다.
 * 열 번호는 0부터 시작하며 양 끝을 포함해 CSS grid 위치로 바로 바꿀 수 있다.
 */
export function buildCalendarWeeks(
  year: number,
  month: number,
  cards: readonly Card[],
): CalendarWeek[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const allDays: CalendarDay[] = Array.from({ length: cellCount }, (_, index) => {
    const date = index - firstWeekday + 1
    if (date < 1 || date > daysInMonth) return { date: null, day: null }
    return {
      date,
      day: localDay(new Date(year, month - 1, date)),
    }
  })
  const ranges = cards
    .map((card) => ({ card, range: cardDateRange(card) }))
    .filter((value): value is { card: Card; range: CardDateRange } => value.range !== null)

  const weeks: CalendarWeek[] = []
  for (let index = 0; index < allDays.length; index += 7) {
    const days = allDays.slice(index, index + 7)
    const candidates = ranges
      .map(({ card, range }) => {
        const occupiedColumns = days.flatMap((day, column) =>
          day.day !== null && range.start <= day.day && day.day <= range.end ? [column] : [],
        )
        if (occupiedColumns.length === 0) return null

        const startColumn = occupiedColumns[0]
        const endColumn = occupiedColumns[occupiedColumns.length - 1]
        const firstVisibleDay = days[startColumn].day!
        const lastVisibleDay = days[endColumn].day!
        return {
          card,
          startColumn,
          endColumn,
          lane: 0,
          continuesBefore: range.start < firstVisibleDay,
          continuesAfter: range.end > lastVisibleDay,
        }
      })
      .filter((segment): segment is CalendarRangeSegment => segment !== null)
      .sort(
        (left, right) =>
          left.startColumn - right.startColumn ||
          right.endColumn - left.endColumn ||
          left.card.title.localeCompare(right.card.title) ||
          left.card.id.localeCompare(right.card.id),
      )

    // 배열 앞쪽에서 처음 사용 가능한 lane을 재사용하는 greedy 배치로,
    // 기존 lane 순서를 안정적으로 유지하면서 막대가 겹치지 않게 한다.
    const laneEnds: number[] = []
    for (const segment of candidates) {
      let lane = laneEnds.findIndex((endColumn) => endColumn < segment.startColumn)
      if (lane === -1) lane = laneEnds.length
      segment.lane = lane
      laneEnds[lane] = segment.endColumn
    }

    weeks.push({
      days,
      segments: candidates,
      laneCount: laneEnds.length,
    })
  }
  return weeks
}
