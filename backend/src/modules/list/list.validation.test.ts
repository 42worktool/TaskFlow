import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createListSchema,
  listReorderSchema,
  updateListSchema,
} from './list.validation'

test('list validation accepts names and strict partial updates', () => {
  assert.deepEqual(createListSchema.parse({ name: 'Todo' }), {
    name: 'Todo',
  })
  assert.deepEqual(updateListSchema.parse({ name: 'Done' }), {
    name: 'Done',
  })
  assert.throws(() => createListSchema.parse({ name: '' }))
  assert.throws(() => updateListSchema.parse({ name: '' }))
  assert.throws(() => createListSchema.parse({ name: 'Todo', extra: true }))
})

test('list ordering requires at least one neighbor', () => {
  assert.equal(
    listReorderSchema.parse({ after_list_id: null }).after_list_id,
    null,
  )
  assert.throws(() => listReorderSchema.parse({}))
})
