// 캘린더 격자의 경계와 날짜 범위에 따른 카드 표시 규칙을 검증한다.
import { describe, expect, it } from 'vitest'
import type { Card } from '../../src/types'
import { buildCalendarWeeks, cardOccursOnDate } from '../../src/utils/calendar'

function localIso(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day, 12).toISOString()
}

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    list_id: 'list-1',
    title: 'Prototype',
    description: null,
    is_completed: false,
    start_at: null,
    deadline: null,
    sequence: 1,
    created_at: localIso(2026, 6, 1),
    ...overrides,
  }
}

describe('cardOccursOnDate', () => {
  it('excludes cards without dates', () => {
    expect(cardOccursOnDate(card(), new Date(2026, 6, 29))).toBe(false)
  })

  it('uses either a start or deadline as a single calendar day', () => {
    const date = new Date(2026, 6, 29)

    expect(cardOccursOnDate(card({ start_at: localIso(2026, 6, 29) }), date)).toBe(true)
    expect(cardOccursOnDate(card({ deadline: localIso(2026, 6, 29) }), date)).toBe(true)
    expect(cardOccursOnDate(card({ deadline: localIso(2026, 6, 29) }), new Date(2026, 6, 30))).toBe(
      false,
    )
  })

  it('includes every local day in a range crossing a month boundary', () => {
    const rangedCard = card({
      start_at: localIso(2026, 6, 31),
      deadline: localIso(2026, 7, 2),
    })

    expect(cardOccursOnDate(rangedCard, new Date(2026, 6, 31))).toBe(true)
    expect(cardOccursOnDate(rangedCard, new Date(2026, 7, 1))).toBe(true)
    expect(cardOccursOnDate(rangedCard, new Date(2026, 7, 2))).toBe(true)
    expect(cardOccursOnDate(rangedCard, new Date(2026, 7, 3))).toBe(false)
  })
})

describe('buildCalendarWeeks', () => {
  it('turns a card range into one continuous weekly segment', () => {
    const rangedCard = card({
      start_at: localIso(2026, 6, 6),
      deadline: localIso(2026, 6, 9),
    })

    const weeks = buildCalendarWeeks(2026, 7, [rangedCard])
    const segment = weeks[1].segments[0]

    expect(segment).toMatchObject({
      card: rangedCard,
      startColumn: 1,
      endColumn: 4,
      lane: 0,
      continuesBefore: false,
      continuesAfter: false,
    })
  })

  it('splits a range at the week boundary and marks its continuation', () => {
    const rangedCard = card({
      start_at: localIso(2026, 6, 10),
      deadline: localIso(2026, 6, 13),
    })

    const weeks = buildCalendarWeeks(2026, 7, [rangedCard])

    expect(weeks[1].segments[0]).toMatchObject({
      startColumn: 5,
      endColumn: 6,
      continuesBefore: false,
      continuesAfter: true,
    })
    expect(weeks[2].segments[0]).toMatchObject({
      startColumn: 0,
      endColumn: 1,
      continuesBefore: true,
      continuesAfter: false,
    })
  })

  it('puts overlapping ranges into separate lanes and reuses free lanes', () => {
    const first = card({
      id: 'first',
      title: 'First',
      start_at: localIso(2026, 6, 6),
      deadline: localIso(2026, 6, 9),
    })
    const overlapping = card({
      id: 'overlapping',
      title: 'Overlapping',
      start_at: localIso(2026, 6, 8),
      deadline: localIso(2026, 6, 10),
    })
    const later = card({
      id: 'later',
      title: 'Later',
      start_at: localIso(2026, 6, 10),
      deadline: localIso(2026, 6, 11),
    })

    const week = buildCalendarWeeks(2026, 7, [later, overlapping, first])[1]
    const lanes = Object.fromEntries(
      week.segments.map((segment) => [segment.card.id, segment.lane]),
    )

    expect(week.laneCount).toBe(2)
    expect(lanes).toEqual({
      first: 0,
      overlapping: 1,
      later: 0,
    })
  })

  it('clips a range crossing the month boundary to visible days', () => {
    const rangedCard = card({
      start_at: localIso(2026, 5, 29),
      deadline: localIso(2026, 6, 3),
    })

    const firstWeek = buildCalendarWeeks(2026, 7, [rangedCard])[0]

    expect(firstWeek.segments[0]).toMatchObject({
      startColumn: 3,
      endColumn: 5,
      continuesBefore: true,
      continuesAfter: false,
    })
  })
})
