import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  RealtimeError,
  RealtimeHandlerContext,
  RealtimeRouter,
} from './router';

const context: RealtimeHandlerContext = {
  connectionId: 'connection-id',
  userId: 'user-id',
  send: () => undefined,
  join: () => undefined,
  leave: () => undefined,
  publish: () => undefined,
};

describe('RealtimeRouter', () => {
  it('validates data and returns the handler result', async () => {
    const router = new RealtimeRouter();
    router.register(
      'example.echo',
      z.object({ value: z.string() }),
      (_handlerContext, data) => ({ echoed: data.value }),
    );

    assert.deepEqual(
      await router.dispatch('example.echo', { value: 'hello' }, context),
      { echoed: 'hello' },
    );
  });

  it('rejects unknown events with a stable public error', async () => {
    const router = new RealtimeRouter();

    await assert.rejects(
      router.dispatch('missing.event', {}, context),
      (error: unknown) =>
        error instanceof RealtimeError && error.code === 'UNKNOWN_EVENT',
    );
  });

  it('does not invoke handlers with invalid data', async () => {
    const router = new RealtimeRouter();
    let invoked = false;
    router.register('example.validated', z.object({ count: z.number().int() }), () => {
      invoked = true;
    });

    await assert.rejects(
      router.dispatch('example.validated', { count: '1' }, context),
      (error: unknown) =>
        error instanceof RealtimeError && error.code === 'INVALID_EVENT_DATA',
    );
    assert.equal(invoked, false);
  });

  it('prevents accidental duplicate registrations', () => {
    const router = new RealtimeRouter();
    router.register('example.unique', z.object({}), () => undefined);

    assert.throws(
      () => router.register('example.unique', z.object({}), () => undefined),
      /already registered/,
    );
  });

  it('requires namespaced event names at registration time', () => {
    const router = new RealtimeRouter();

    assert.throws(
      () => router.register('unnamespaced', z.object({}), () => undefined),
      /Invalid realtime event name/,
    );
  });
});
