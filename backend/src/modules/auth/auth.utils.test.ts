import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  safeEqual,
  safeReturnTo,
  verifyPassword,
} from './auth.utils';

test('normalizeEmail trims and lowercases an address', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});

test('isValidEmail accepts a normal address and rejects malformed input', () => {
  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('a@b'), false);
});

test('password hashing verifies the original password without storing it', async () => {
  const encodedHash = await hashPassword('correct horse battery staple');

  assert.match(encodedHash, /^scrypt-v1\$/);
  assert.equal(encodedHash.includes('correct horse battery staple'), false);
  assert.equal(await verifyPassword('correct horse battery staple', encodedHash), true);
  assert.equal(await verifyPassword('wrong password', encodedHash), false);
  assert.equal(await verifyPassword('wrong password', null), false);
});

test('safeEqual compares OAuth state values', () => {
  assert.equal(safeEqual('same-state', 'same-state'), true);
  assert.equal(safeEqual('same-state', 'other-state'), false);
  assert.equal(safeEqual(undefined, 'state'), false);
});

test('safeReturnTo accepts only application-relative paths', () => {
  assert.equal(safeReturnTo('/workspaces/abc?tab=board'), '/workspaces/abc?tab=board');
  assert.equal(safeReturnTo('https://evil.example'), '/workspaces');
  assert.equal(safeReturnTo('//evil.example/path'), '/workspaces');
  assert.equal(safeReturnTo(undefined), '/workspaces');
});
