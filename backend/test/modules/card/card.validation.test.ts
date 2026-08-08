// 카드 변경 요청 데이터와 정렬 요청, 날짜, 댓글의 유효성을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cardCompletionSchema,
  cardDatesSchema,
  cardNeighborSchema,
  commentSchema,
  createCardSchema,
} from '../../../src/modules/card/card.validation'

test('card validation accepts valid create, ordering, date, and comment bodies', () => {
  assert.equal(createCardSchema.parse({ title: 'Card' }).title, 'Card')
  assert.equal(cardNeighborSchema.parse({ before_card_id: null }).before_card_id, null)
  assert.equal(
    cardDatesSchema.parse({ deadline: '2026-07-27T00:00:00Z' }).deadline,
    '2026-07-27T00:00:00Z',
  )
  assert.equal(cardCompletionSchema.parse({ is_completed: true }).is_completed, true)
  assert.equal(commentSchema.parse({ comment_str: 'Hello' }).comment_str, 'Hello')
})

test('card validation rejects empty updates and invalid values', () => {
  assert.throws(() => createCardSchema.parse({ title: '' }))
  assert.throws(() => cardNeighborSchema.parse({}))
  assert.throws(() => cardDatesSchema.parse({}))
  assert.throws(() => cardDatesSchema.parse({ deadline: 'not-a-date' }))
  assert.throws(() => cardCompletionSchema.parse({}))
  assert.throws(() => cardCompletionSchema.parse({ is_completed: 'yes' }))
  assert.throws(() => commentSchema.parse({ comment_str: '' }))
})
