// 가로 드래그 자동 스크롤의 방향과 한계, 가장자리 가속을 검증한다.
import { describe, expect, it } from 'vitest'
import { horizontalEdgeScrollDelta } from '../../src/utils/dragAutoScroll'

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
    // 컨테이너가 이미 스크롤 한계에 있다면 가장자리에 가까운 것만으로는 이동하면 안 된다.
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
    // 마지막 프레임에서는 범위를 넘지 않도록 남은 5픽셀만 이동해야 한다.
    expect(
      horizontalEdgeScrollDelta({
        ...base,
        pointerX: 1200,
        scrollLeft: 795,
      }),
    ).toBe(5)
  })
})
