export interface CardDragContext {
  cardId: string
  source: 'board' | 'inbox'
}

export function getBoardCardDropId(drag: CardDragContext | null): string | null {
  if (drag?.source !== 'board') return null
  const cardId = drag.cardId.trim()
  return cardId || null
}

export function findDroppedCard<T extends { id: string }>(
  cards: readonly T[],
  cardId: string,
): T | null {
  return cards.find((card) => card.id === cardId) ?? null
}
