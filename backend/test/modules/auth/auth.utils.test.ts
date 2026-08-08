// 사용자 식별 필드와 비밀번호, OAuth 상태, 리디렉션에 쓰이는 인증 도우미를 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hashPassword,
  accountName,
  safeEqual,
  safeReturnTo,
  verifyPassword,
} from '../../../src/modules/auth/auth.utils'
import { AppError } from '../../../src/errors'

test('accountName trims valid names and rejects invalid values consistently', () => {
  assert.equal(accountName('  Task Flow  '), 'Task Flow')
  assert.throws(
    () => accountName('x'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'INVALID_NAME')
      return true
    },
  )
})

test('password hashing verifies the original password without storing it', async () => {
  const encodedHash = await hashPassword('correct horse battery staple')

  assert.match(encodedHash, /^scrypt-v1\$/)
  assert.equal(encodedHash.includes('correct horse battery staple'), false)
  assert.equal(await verifyPassword('correct horse battery staple', encodedHash), true)
  assert.equal(await verifyPassword('wrong password', encodedHash), false)
  assert.equal(await verifyPassword('wrong password', null), false)
})

test('safeEqual compares OAuth state values', () => {
  assert.equal(safeEqual('same-state', 'same-state'), true)
  assert.equal(safeEqual('same-state', 'other-state'), false)
  assert.equal(safeEqual(undefined, 'state'), false)
})

test('safeReturnTo accepts only application-relative paths', () => {
  assert.equal(safeReturnTo('/workspaces/abc?tab=board'), '/workspaces/abc?tab=board')
  assert.equal(safeReturnTo('https://evil.example'), '/workspaces')
  assert.equal(safeReturnTo('//evil.example/path'), '/workspaces')
  assert.equal(safeReturnTo(undefined), '/workspaces')
})
