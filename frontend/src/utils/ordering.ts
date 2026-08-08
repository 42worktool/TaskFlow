// sequence 숫자를 직접 계산하지 않고 서버가 재정렬할 앞·뒤 이웃 ID를 구한다.
interface Identified {
  id: string
}

export function neighborIds<T extends Identified>(items: T[], index: number) {
  return {
    beforeId: items[index - 1]?.id ?? null,
    afterId: items[index + 1]?.id ?? null,
  }
}
