import { describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { cardOccursOnDate } from './calendar'

function localIso(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day, 12).toISOString()
}

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    list_id: 'list-1',
    title: 'Prototype',
    description: null,
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

    expect(
      cardOccursOnDate(card({ start_at: localIso(2026, 6, 29) }), date),
    ).toBe(true)
    expect(
      cardOccursOnDate(card({ deadline: localIso(2026, 6, 29) }), date),
    ).toBe(true)
    expect(
      cardOccursOnDate(
        card({ deadline: localIso(2026, 6, 29) }),
        new Date(2026, 6, 30),
      ),
    ).toBe(false)
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
