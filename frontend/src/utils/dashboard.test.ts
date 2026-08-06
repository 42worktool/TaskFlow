import { describe, expect, it } from 'vitest'
import { buildContributionCells, contributionLevel, formatDashboardDate } from './dashboard'

describe('dashboard utilities', () => {
  it('maps activity counts into four non-zero intensity levels', () => {
    expect(contributionLevel(0, 8)).toBe(0)
    expect(contributionLevel(1, 8)).toBe(1)
    expect(contributionLevel(3, 8)).toBe(2)
    expect(contributionLevel(6, 8)).toBe(3)
    expect(contributionLevel(8, 8)).toBe(4)
  })

  it('pads contribution days to complete Sunday-first weeks', () => {
    const cells = buildContributionCells([
      { date: '2026-07-27', count: 1, log_count: 2 },
      { date: '2026-07-28', count: 0, log_count: 0 },
    ])

    expect(cells).toHaveLength(7)
    expect(cells.slice(0, 1).every((cell) => cell.placeholder)).toBe(true)
    expect(cells[1]).toMatchObject({
      date: '2026-07-27',
      count: 1,
      logCount: 2,
      placeholder: false,
    })
    expect(cells.slice(3).every((cell) => cell.placeholder)).toBe(true)
  })

  it('formats API date keys in UTC', () => {
    expect(formatDashboardDate('2026-07-30')).toContain('7')
    expect(formatDashboardDate('2026-07-30')).toContain('30')
  })
})
