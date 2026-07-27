import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSequence } from './ordering'

const siblings = [
  { id: 'first', sequence: 10 },
  { id: 'second', sequence: 20 },
]

test('computeSequence appends to empty and populated collections', () => {
  assert.equal(computeSequence([]), 1)
  assert.equal(computeSequence(siblings), 21)
})

test('computeSequence prepends, appends, and inserts between neighbors', () => {
  assert.equal(computeSequence(siblings, null, 'first'), 9)
  assert.equal(computeSequence(siblings, 'second', null), 21)
  assert.equal(computeSequence(siblings, 'first', 'second'), 15)
})

test('computeSequence preserves append behavior for absent neighbor ids', () => {
  assert.equal(computeSequence(siblings, 'missing', null), 21)
})
