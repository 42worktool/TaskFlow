import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cardDatesSchema,
  cardNeighborSchema,
  commentSchema,
  createCardSchema,
} from './card.validation'

test('card validation accepts valid create, ordering, date, and comment bodies', () => {
  assert.equal(createCardSchema.parse({ title: 'Card' }).title, 'Card')
  assert.equal(
    cardNeighborSchema.parse({ before_card_id: null }).before_card_id,
    null,
  )
  assert.equal(
    cardDatesSchema.parse({ deadline: '2026-07-27T00:00:00Z' }).deadline,
    '2026-07-27T00:00:00Z',
  )
  assert.equal(commentSchema.parse({ comment_str: 'Hello' }).comment_str, 'Hello')
})

test('card validation rejects empty updates and invalid values', () => {
  assert.throws(() => createCardSchema.parse({ title: '' }))
  assert.throws(() => cardNeighborSchema.parse({}))
  assert.throws(() => cardDatesSchema.parse({}))
  assert.throws(() => cardDatesSchema.parse({ deadline: 'not-a-date' }))
  assert.throws(() => commentSchema.parse({ comment_str: '' }))
})
