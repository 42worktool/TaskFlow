import assert from 'node:assert/strict'
import test from 'node:test'
import { searchQuerySchema } from './search.validation'

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'
const LABEL_ID = '00000000-0000-4000-8000-000000000002'

test('search query defaults preserve the existing search behavior', () => {
  assert.deepEqual(searchQuerySchema.parse({ q: '  product roadmap  ' }), {
    q: 'product roadmap',
    type: 'all',
    sort: 'relevance',
    page: 1,
    limit: 10,
  })
})

test('search query accepts the existing filters and pagination', () => {
  assert.deepEqual(
    searchQuerySchema.parse({
      q: '',
      type: 'card',
      workspace_id: WORKSPACE_ID,
      label_id: LABEL_ID,
      sort: 'newest',
      page: '2',
      limit: '25',
    }),
    {
      q: '',
      type: 'card',
      workspace_id: WORKSPACE_ID,
      label_id: LABEL_ID,
      sort: 'newest',
      page: 2,
      limit: 25,
    },
  )
})

test('label search requires a workspace and a compatible result type', () => {
  assert.throws(() => searchQuerySchema.parse({ label_id: LABEL_ID }))
  assert.throws(() =>
    searchQuerySchema.parse({
      type: 'user',
      workspace_id: WORKSPACE_ID,
      label_id: LABEL_ID,
    }),
  )
})

test('search query rejects unsupported values and excessive page sizes', () => {
  assert.throws(() => searchQuerySchema.parse({ type: 'list' }))
  assert.throws(() => searchQuerySchema.parse({ sort: 'oldest' }))
  assert.throws(() => searchQuerySchema.parse({ page: 0 }))
  assert.throws(() => searchQuerySchema.parse({ limit: 51 }))
  assert.throws(() => searchQuerySchema.parse({ unknown: 'value' }))
})
