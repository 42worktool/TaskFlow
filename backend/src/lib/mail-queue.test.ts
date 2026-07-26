import assert from 'node:assert/strict';
import test from 'node:test';

function makeQueue() {
  const jobs: string[] = [];
  return {
    lPush: async (_key: string, value: string) => {
      jobs.unshift(value);
      return jobs.length;
    },
    brPop: async (_key: string, _timeout: number) => {
      if (jobs.length === 0) return null;
      return { element: jobs.pop()! };
    },
  };
}

async function enqueue(redis: ReturnType<typeof makeQueue>, options: any) {
  await redis.lPush('mail:queue', JSON.stringify(options));
}

test('enqueue + deque round-trips a job', async () => {
  const redis = makeQueue();
  await enqueue(redis, { to: 'a@b.com', subject: 'hello', text: 'world' });

  const result = await redis.brPop('mail:queue', 0);
  assert.ok(result);
  const parsed = JSON.parse(result!.element);
  assert.equal(parsed.to, 'a@b.com');
  assert.equal(parsed.subject, 'hello');
  assert.equal(parsed.text, 'world');
});

test('deque returns null when queue is empty', async () => {
  const redis = makeQueue();
  const result = await redis.brPop('mail:queue', 0);
  assert.equal(result, null);
});

test('FIFO order preserved (lPush + pop)', async () => {
  const redis = makeQueue();
  await enqueue(redis, { to: 'a@b.com', subject: 'first' });
  await enqueue(redis, { to: 'c@d.com', subject: 'second' });

  // lPush adds to head, pop from tail = FIFO
  const job1 = await redis.brPop('mail:queue', 0);
  const job2 = await redis.brPop('mail:queue', 0);

  assert.equal(JSON.parse(job1!.element).subject, 'first');
  assert.equal(JSON.parse(job2!.element).subject, 'second');
});

test('null after queue exhausted', async () => {
  const redis = makeQueue();
  await enqueue(redis, { to: 'x@x', subject: 'only' });
  const job = await redis.brPop('mail:queue', 0);
  assert.ok(job);
  const empty = await redis.brPop('mail:queue', 0);
  assert.equal(empty, null);
});
