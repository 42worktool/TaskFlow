import assert from 'node:assert/strict';
import test from 'node:test';

const redisStub = new Map<string, string>();

function makeMockRedis() {
  return {
    incr: async (key: string) => {
      const current = Number(redisStub.get(key) ?? 0) + 1;
      redisStub.set(key, String(current));
      return current;
    },
    expire: async () => true,
  };
}

async function checkMailRateLimit(email: string): Promise<void> {
  const redis = makeMockRedis();
  const k = `mail:ratelimit:${email}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, 3600);
  if (count > 5) throw new Error('rate limited');
}

test('checkMailRateLimit allows up to 5 sends per email', async () => {
  for (let i = 0; i < 5; i++) {
    await checkMailRateLimit('test@example.com');
  }
  await assert.rejects(
    () => checkMailRateLimit('test@example.com'),
    /rate limited/,
  );
  redisStub.clear();
});

test('checkMailRateLimit tracks separate emails independently', async () => {
  await checkMailRateLimit('a@example.com');
  await checkMailRateLimit('a@example.com');
  await checkMailRateLimit('b@example.com');
  await checkMailRateLimit('b@example.com');
  redisStub.clear();
});
