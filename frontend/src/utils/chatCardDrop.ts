// 카드 드래그의 출처를 확인하고 채팅 드롭에서 실제 보드 카드만 찾는 보조 함수다.
export interface CardDragContext {
  cardId: string
  source: 'board' | 'inbox'
}

export function getBoardCardDropId(drag: CardDragContext | null): string | null {
  // 인박스에서 시작한 카드는 보드로 꺼내는 흐름이므로 채팅 첨부 대상으로 선점하지 않는다.
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
