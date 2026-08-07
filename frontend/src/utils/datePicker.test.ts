import { describe, expect, it } from 'vitest'
import {
  buildDatePickerDays,
  clampDateValue,
  dateValue,
  formatDateValue,
  monthHasSelectableDate,
  moveDateByDays,
  moveDateByMonths,
  parseDateValue,
} from './datePicker'

describe('cross-browser date picker helpers', () => {
  it('parses strict local date values without relying on browser string parsing', () => {
    expect(parseDateValue('2026-08-07')).toMatchObject({})
    expect(parseDateValue('2026-02-29')).toBeNull()
    expect(parseDateValue('08/07/2026')).toBeNull()
    expect(formatDateValue('2026-08-07')).toBe('2026년 8월 7일')
  })

  it('builds a stable six-week Sunday-first grid', () => {
    const days = buildDatePickerDays(2026, 8, undefined, undefined, new Date(2026, 7, 7, 12))

    expect(days).toHaveLength(42)
    expect(days[0].value).toBe('2026-07-26')
    expect(days[6].value).toBe('2026-08-01')
    expect(days.find((day) => day.value === '2026-08-07')?.isToday).toBe(true)
  })

  it('marks dates outside the supplied range as disabled', () => {
    const days = buildDatePickerDays(2026, 8, '2026-08-05', '2026-08-10')

    expect(days.find((day) => day.value === '2026-08-04')?.disabled).toBe(true)
    expect(days.find((day) => day.value === '2026-08-05')?.disabled).toBe(false)
    expect(days.find((day) => day.value === '2026-08-11')?.disabled).toBe(true)
  })

  it('moves by day or month while preserving valid calendar dates', () => {
    expect(moveDateByDays('2026-08-01', -1)).toBe('2026-07-31')
    expect(moveDateByMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(moveDateByMonths('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('clamps active dates and detects navigable month ranges', () => {
    expect(clampDateValue('2026-08-01', '2026-08-05', '2026-08-10')).toBe('2026-08-05')
    expect(clampDateValue('2026-08-20', '2026-08-05', '2026-08-10')).toBe('2026-08-10')
    expect(monthHasSelectableDate(2026, 7, '2026-08-05')).toBe(false)
    expect(monthHasSelectableDate(2026, 8, '2026-08-05', '2026-08-10')).toBe(true)
    expect(dateValue(new Date(2026, 7, 7, 12))).toBe('2026-08-07')
  })
})
