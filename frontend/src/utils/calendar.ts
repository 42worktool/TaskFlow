import type { Card } from '../types'

function localDay(value: string | Date): number | null {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Calendar dates follow the browser's local day, matching the date shown on cards.
 * A single start/deadline is a one-day event; two dates form an inclusive range.
 */
export function cardOccursOnDate(card: Card, date: Date): boolean {
  const day = localDay(date)
  const start = card.start_at ? localDay(card.start_at) : null
  const deadline = card.deadline ? localDay(card.deadline) : null
  const firstDay = start ?? deadline
  const lastDay = deadline ?? start

  return (
    day !== null &&
    firstDay !== null &&
    lastDay !== null &&
    firstDay <= day &&
    day <= lastDay
  )
}
