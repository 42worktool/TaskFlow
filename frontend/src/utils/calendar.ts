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

export interface CalendarDay {
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
 * Calendar dates follow the browser's local day, matching the date shown on cards.
 * A single start/deadline is a one-day event; two dates form an inclusive range.
 */
export function cardOccursOnDate(card: Card, date: Date): boolean {
  const day = localDay(date)
  const range = cardDateRange(card)

  return day !== null && range !== null && range.start <= day && day <= range.end
}

/**
 * Builds month rows and lays overlapping card ranges into separate weekly lanes.
 * Columns are zero-based and inclusive so the view can map them directly to CSS grid.
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
