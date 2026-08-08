// 채팅이 보드 카드 드롭은 받고, 만료되었거나 인박스에서 시작한 드래그는 거부하는지 검증한다.
import { describe, expect, it } from 'vitest'
import { findDroppedCard, getBoardCardDropId } from '../../src/utils/chatCardDrop'

describe('chat card drop', () => {
  it('accepts only a board card drag', () => {
    expect(getBoardCardDropId({ cardId: 'card-1', source: 'board' })).toBe('card-1')
    expect(getBoardCardDropId({ cardId: 'card-1', source: 'inbox' })).toBeNull()
    expect(getBoardCardDropId(null)).toBeNull()
  })

  it('resolves a dropped card against the refreshed workspace cards', () => {
    const cards = [
      { id: 'card-1', title: 'First' },
      { id: 'card-2', title: 'Second' },
    ]

    expect(findDroppedCard(cards, 'card-2')).toEqual(cards[1])
    expect(findDroppedCard(cards, 'stale-card')).toBeNull()
  })
})
