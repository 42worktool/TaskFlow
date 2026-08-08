// 카드 날짜 변환과 한쪽 끝이 열린 날짜 범위의 유효성 검사를 검증한다.
import { describe, expect, it } from 'vitest'
import { isDateRangeValid, toDateInput, toIsoDate } from '../../src/utils/cardDates'

describe('card date form helpers', () => {
  it('round-trips a date through the local timezone', () => {
    const input = '2026-07-29'
    expect(toDateInput(toIsoDate(input))).toBe(input)
  })

  it('represents cleared dates as an empty input and null API value', () => {
    expect(toDateInput(null)).toBe('')
    expect(toIsoDate('')).toBeNull()
  })

  it('accepts open ranges and rejects a start after the deadline', () => {
    expect(isDateRangeValid('', '2026-07-29')).toBe(true)
    expect(isDateRangeValid('2026-07-29', '')).toBe(true)
    expect(isDateRangeValid('2026-07-29', '2026-07-29')).toBe(true)
    expect(isDateRangeValid('2026-07-30', '2026-07-29')).toBe(false)
  })
})
