import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { inviteEmail, welcomeEmail, passwordResetEmail } from './mail-templates';

test('inviteEmail returns correct structure with no to field', () => {
  const result = inviteEmail('Test Workspace', 'https://app.example/invite/token123');

  assert.equal(result.subject, 'Test Workspace에서 당신을 초대했습니다');
  assert.ok(result.text.includes('Test Workspace에서 당신을 초대했습니다'));
  assert.ok(result.text.includes('https://app.example/invite/token123'));
  assert.ok(result.html.includes('<h2>Test Workspace</h2>'));
  assert.ok(result.html.includes('https://app.example/invite/token123'));
  assert.ok(!('to' in result));
});

test('inviteEmail escapes HTML-safe workspace names', () => {
  const result = inviteEmail('<script>alert("xss")</script>', '/invite/token');

  assert.ok(result.subject.includes('<script>'));
  assert.ok(result.html.includes('<script>'));
});

test('welcomeEmail returns correct structure', () => {
  const result = welcomeEmail('홍길동', 'https://app.example');

  assert.equal(result.subject, 'TaskFlow에 오신 것을 환영합니다');
  assert.ok(result.text.includes('홍길동'));
  assert.ok(result.text.includes('https://app.example'));
  assert.ok(result.html.includes('홍길동'));
  assert.ok(!('to' in result));
});

test('passwordResetEmail returns correct structure', () => {
  const result = passwordResetEmail('홍길동', 'https://app.example/reset/token123');

  assert.equal(result.subject, '비밀번호 재설정');
  assert.ok(result.text.includes('홍길동'));
  assert.ok(result.text.includes('https://app.example/reset/token123'));
  assert.ok(result.html.includes('https://app.example/reset/token123'));
  assert.ok(!('to' in result));
});
