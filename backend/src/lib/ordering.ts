interface Sequenced {
  id: string
  sequence: number
}

export function computeSequence<T extends Sequenced>(
  siblings: T[],
  beforeId?: string | null,
  afterId?: string | null,
): number {
  // 인접 항목의 중간값을 사용하면 드래그 한 번마다 전체 목록의 순번을 다시 쓰지 않아도 된다.
  const before = beforeId ? siblings.find((item) => item.id === beforeId) : null
  const after = afterId ? siblings.find((item) => item.id === afterId) : null

  if (!before && !after) return (siblings[siblings.length - 1]?.sequence ?? 0) + 1
  if (!before) return after!.sequence - 1
  if (!after) return before.sequence + 1
  return (before.sequence + after.sequence) / 2
}
