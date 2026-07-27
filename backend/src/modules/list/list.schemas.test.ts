import assert from 'node:assert/strict'
import test from 'node:test'
import { listNameSchema, listReorderSchema } from './list.schemas'

test('list schemas enforce names and at least one ordering neighbor', () => {
  assert.equal(listNameSchema.parse({ name: 'Todo' }).name, 'Todo')
  assert.throws(() => listNameSchema.parse({ name: '' }))
  assert.equal(
    listReorderSchema.parse({ after_list_id: null }).after_list_id,
    null,
  )
  assert.throws(() => listReorderSchema.parse({}))
})
