import { describe, expect, it } from 'vitest'
import { horizontalEdgeScrollDelta } from './dragAutoScroll'

const base = {
  left: 200,
  right: 1200,
  scrollLeft: 200,
  clientWidth: 1000,
  scrollWidth: 1800,
}

describe('horizontalEdgeScrollDelta', () => {
  it('scrolls toward either edge and stays idle in the middle', () => {
    expect(horizontalEdgeScrollDelta({ ...base, pointerX: 210 })).toBeLessThan(0)
    expect(horizontalEdgeScrollDelta({ ...base, pointerX: 1190 })).toBeGreaterThan(0)
    expect(horizontalEdgeScrollDelta({ ...base, pointerX: 700 })).toBe(0)
  })

  it('does not scroll past either boundary', () => {
    expect(
      horizontalEdgeScrollDelta({
        ...base,
        pointerX: 200,
        scrollLeft: 0,
      }),
    ).toBe(0)
    expect(
      horizontalEdgeScrollDelta({
        ...base,
        pointerX: 1200,
        scrollLeft: 800,
      }),
    ).toBe(0)
  })

  it('clamps the final step to the remaining scroll distance', () => {
    expect(
      horizontalEdgeScrollDelta({
        ...base,
        pointerX: 1200,
        scrollLeft: 795,
      }),
    ).toBe(5)
  })
})
