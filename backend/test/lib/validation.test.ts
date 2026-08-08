// 여러 API 모듈에서 공유하는 정규화와 유효성 검사 규약을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizedEmailSchema, normalizeEmail, uuidSchema } from '../../src/lib/validation'

test('shared email validation normalizes valid addresses', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com')
  assert.equal(normalizedEmailSchema.parse('  User@Example.COM '), 'user@example.com')
  assert.throws(() => normalizedEmailSchema.parse('not-an-email'))
})

test('shared UUID validation normalizes valid identifiers', () => {
  assert.equal(
    uuidSchema.parse('AAAAAAAA-0000-4000-8000-000000000001'),
    'aaaaaaaa-0000-4000-8000-000000000001',
  )
  assert.throws(() => uuidSchema.parse('not-a-uuid'))
})
