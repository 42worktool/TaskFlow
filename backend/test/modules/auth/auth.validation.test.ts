// 계정 프로필 입력의 정규화와 안전하지 않은 공개 필드의 거부를 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { updateAccountSchema } from '../../../src/modules/auth/auth.validation'

test('account profile validation normalizes public profile fields', () => {
  assert.deepEqual(
    updateAccountSchema.parse({
      name: ' 프로필 사용자 ',
      headline: ' 제품을 만드는 개발자입니다. ',
      linkedin_url: 'linkedin.com/in/example',
    }),
    {
      name: '프로필 사용자',
      headline: '제품을 만드는 개발자입니다.',
      linkedin_url: 'https://linkedin.com/in/example',
    },
  )

  assert.deepEqual(updateAccountSchema.parse({ linkedin_url: '' }), { linkedin_url: null })
})

test('account profile validation rejects unsafe links and multiline headlines', () => {
  assert.throws(() =>
    updateAccountSchema.parse({ linkedin_url: 'https://linkedin.example.com/me' }),
  )
  assert.throws(() => updateAccountSchema.parse({ headline: '첫 줄\n둘째 줄' }))
  assert.throws(() => updateAccountSchema.parse({}))
})
