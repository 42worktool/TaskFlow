import assert from 'node:assert/strict'
import test from 'node:test'
import { inviteEmail } from './mail-templates'

test('inviteEmail returns correct structure with no to field', () => {
  const result = inviteEmail('Test Workspace', 'https://app.example/invite/token123')

  assert.equal(result.subject, 'Test Workspace에서 당신을 초대했습니다')
  assert.ok(result.text.includes('Test Workspace에서 당신을 초대했습니다'))
  assert.ok(result.text.includes('https://app.example/invite/token123'))
  assert.ok(result.html.includes('<h2>Test Workspace</h2>'))
  assert.ok(result.html.includes('https://app.example/invite/token123'))
  assert.ok(!('to' in result))
})

test('inviteEmail escapes unsafe HTML values', () => {
  const result = inviteEmail('<script>alert("xss")</script>', '"/invite/token?x=1&y=2')

  assert.ok(result.subject.includes('<script>'))
  assert.ok(!result.html.includes('<script>'))
  assert.ok(result.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'))
  assert.ok(result.html.includes('&quot;/invite/token?x=1&amp;y=2'))
})
