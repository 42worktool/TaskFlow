import type { Card, List } from '@prisma/client'
import { toCardDto } from '../card/card.dto'

export function toListDto(list: List) {
  return {
    id: list.id,
    workspace_id: list.workspace_id,
    name: list.name,
    sequence: list.sequence,
  }
}

export function toBoardListDto(list: List & { cards: Card[] }) {
  return {
    ...toListDto(list),
    cards: list.cards.map(toCardDto),
  }
}
