interface Identified {
  id: string
}

export function neighborIds<T extends Identified>(items: T[], index: number) {
  return {
    beforeId: items[index - 1]?.id ?? null,
    afterId: items[index + 1]?.id ?? null,
  }
}
