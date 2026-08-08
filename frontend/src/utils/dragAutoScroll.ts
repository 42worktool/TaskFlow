// 카드 드래그 중 보드 좌우 끝에 가까워진 정도를 수평 스크롤 이동량으로 바꾼다.
interface HorizontalEdgeScrollInput {
  pointerX: number
  left: number
  right: number
  scrollLeft: number
  clientWidth: number
  scrollWidth: number
  edgeSize?: number
  maxStep?: number
}

export function horizontalEdgeScrollDelta({
  pointerX,
  left,
  right,
  scrollLeft,
  clientWidth,
  scrollWidth,
  edgeSize = 96,
  maxStep = 18,
}: HorizontalEdgeScrollInput): number {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
  if (maxScrollLeft === 0 || pointerX < left || pointerX > right) return 0

  const leftDistance = pointerX - left
  if (leftDistance < edgeSize && scrollLeft > 0) {
    // 가장자리에 가까울수록 더 빠르게 이동하되 남은 스크롤 범위를 넘지 않는다.
    const step = Math.ceil(maxStep * (1 - leftDistance / edgeSize))
    return -Math.min(step, scrollLeft)
  }

  const rightDistance = right - pointerX
  if (rightDistance < edgeSize && scrollLeft < maxScrollLeft) {
    const step = Math.ceil(maxStep * (1 - rightDistance / edgeSize))
    return Math.min(step, maxScrollLeft - scrollLeft)
  }

  return 0
}
