import type { Card, CardLabel, Label, List } from '@prisma/client'
import { toCardDto } from '../card/card.dto'

export type BoardCard = Card & {
  card_labels: Array<CardLabel & {
    label: Pick<Label, 'id' | 'label_name' | 'label_color'>
  }>
}

export function toListDto(list: List) {
  return {
    id: list.id,
    workspace_id: list.workspace_id,
    name: list.name,
    sequence: list.sequence,
  }
}

export function toBoardListDto(list: List & { cards: BoardCard[] }) {
  return {
    ...toListDto(list),
    cards: list.cards.map((card) => toCardDto(card, card.card_labels)),
  }
}
