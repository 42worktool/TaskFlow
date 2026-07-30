import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createListSchema,
  listReorderSchema,
  updateListSchema,
} from './list.validation'

test('list validation accepts explicit completion state and strict partial updates', () => {
  assert.deepEqual(createListSchema.parse({ name: 'Todo' }), {
    name: 'Todo',
    is_done: false,
  })
  assert.equal(
    createListSchema.parse({ name: 'Done', is_done: true }).is_done,
    true,
  )
  assert.deepEqual(updateListSchema.parse({ is_done: true }), {
    is_done: true,
  })
  assert.throws(() => createListSchema.parse({ name: '' }))
  assert.throws(() => updateListSchema.parse({}))
  assert.throws(() => updateListSchema.parse({ name: 'Todo', extra: true }))
})

test('list ordering requires at least one neighbor', () => {
  assert.equal(
    listReorderSchema.parse({ after_list_id: null }).after_list_id,
    null,
  )
  assert.throws(() => listReorderSchema.parse({}))
})
