import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { z } from 'zod';
import {
  OutboundMessage,
  REALTIME_CLOSE_CODE,
  RealtimeReadyData,
} from './protocol';
import { RealtimeError } from './router';
import {
  RealtimeConnectionDisconnectedInfo,
  RealtimeConnectionInfo,
  RealtimePrincipal,
  RealtimeServer,
  RealtimeServerOptions,
} from './server';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<OutboundMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', (raw) => {
      try {
        resolve(JSON.parse(raw.toString()) as OutboundMessage);
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', reject);
  });
}

function closed(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

function messagesUntilClose(socket: WebSocket): Promise<{
  messages: OutboundMessage[];
  code: number;
  reason: string;
}> {
  return new Promise((resolve, reject) => {
    const messages: OutboundMessage[] = [];
    socket.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()) as OutboundMessage);
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', reject);
    socket.once('close', (code, reason) => {
      resolve({ messages, code, reason: reason.toString() });
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function authenticatedSocket(
  port: number,
  accessToken = 'valid-token',
): Promise<{ socket: WebSocket; ready: OutboundMessage }> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    origin: 'http://app.test',
  });
  await opened(socket);
  const readyMessage = nextMessage(socket);
  socket.send(
    JSON.stringify({
      v: 1,
      event: 'auth.authenticate',
      data: { accessToken },
    }),
  );
  return { socket, ready: await readyMessage };
}

function serverOptions(
  authenticateAccessToken: (accessToken: string) => RealtimePrincipal,
  overrides: Partial<RealtimeServerOptions> = {},
): RealtimeServerOptions {
  return {
    path: '/ws',
    allowedOrigin: 'http://app.test',
    authTimeoutMs: 1_000,
    heartbeatIntervalMs: 10_000,
    maxPayloadBytes: 4_096,
    maxMessagesPerMinute: 100,
    authenticateAccessToken,
    ...overrides,
  };
}

function validPrincipal(userId = 'user-1', lifetimeMs = 10_000): RealtimePrincipal {
  return {
    userId,
    expiresAt: Date.now() + lifetimeMs,
  };
}

describe('RealtimeServer', () => {
  let httpServer: Server | null = null;
  let realtimeServer: RealtimeServer | null = null;

  afterEach(async () => {
    await realtimeServer?.close();
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    }
    realtimeServer = null;
    httpServer = null;
  });

  it('rejects invalid outbound event names before attempting delivery', () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));
    realtimeServer.attach(httpServer);

    assert.throws(
      () => realtimeServer?.publish('workspace:1', 'invalid', {}),
      /Invalid outbound realtime event name/,
    );
    assert.throws(
      () => realtimeServer?.sendToUser('user-1', 'also invalid', {}),
      /Invalid outbound realtime event name/,
    );
    assert.throws(
      () => realtimeServer?.publish('workspace:1', 'system.ready', {}),
      /reserved by the protocol/,
    );
    assert.throws(
      () => realtimeServer?.sendToUser('user-1', 'system.error', {}),
      /reserved by the protocol/,
    );
  });

  it('requires the configured Origin header by default', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const missingOrigin = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await assert.rejects(opened(missingOrigin), /Unexpected server response: 403/);

    const wrongOrigin = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'https://attacker.test',
    });
    await assert.rejects(opened(wrongOrigin), /Unexpected server response: 403/);
  });

  it('authenticates, dispatches typed events, and publishes to joined channels', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(
      serverOptions((token) => {
        if (token !== 'valid-token') throw new Error('invalid token');
        return validPrincipal();
      }),
    );
    realtimeServer.register(
      'workspace.subscribe',
      z.object({ workspaceId: z.string() }),
      (context, { workspaceId }) => {
        context.join(`workspace:${workspaceId}`);
        return { subscribed: true };
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'http://app.test',
    });
    await opened(socket);

    const readyMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'auth.authenticate',
        data: { accessToken: 'valid-token' },
      }),
    );
    const ready = await readyMessage;
    const readyData = ready.data as RealtimeReadyData;
    assert.equal(ready.event, 'system.ready');
    assert.match(readyData.connectionId, /^[0-9a-f-]{36}$/);
    assert.equal(readyData.userId, 'user-1');
    assert.equal(readyData.protocolVersion, 1);
    assert.equal(Number.isNaN(Date.parse(readyData.serverTime)), false);
    assert.equal(Number.isNaN(Date.parse(readyData.accessTokenExpiresAt)), false);

    const acknowledgement = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'workspace.subscribe',
        requestId: 'request-1',
        data: { workspaceId: 'workspace-1' },
      }),
    );
    assert.deepEqual(await acknowledgement, {
      v: 1,
      event: 'system.ack',
      requestId: 'request-1',
      data: {
        event: 'workspace.subscribe',
        result: { subscribed: true },
      },
    });

    const published = nextMessage(socket);
    realtimeServer.publish('workspace:workspace-1', 'card.updated', { id: 'card-1' });
    assert.deepEqual(await published, {
      v: 1,
      event: 'card.updated',
      data: { id: 'card-1' },
    });

    socket.close();
  });

  it('removes every user connection from a channel and can clear the channel', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(
      serverOptions((token) =>
        validPrincipal(token === 'user-2-token' ? 'user-2' : 'user-1'),
      ),
    );
    realtimeServer.register(
      'workspace.subscribe',
      z.object({ workspaceId: z.string() }),
      (context, { workspaceId }) => {
        context.join(`workspace:${workspaceId}`);
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const first = (await authenticatedSocket(port, 'user-1-token')).socket;
    const second = (await authenticatedSocket(port, 'user-1-token')).socket;
    const other = (await authenticatedSocket(port, 'user-2-token')).socket;

    for (const [index, socket] of [first, second, other].entries()) {
      const acknowledgement = nextMessage(socket);
      socket.send(
        JSON.stringify({
          v: 1,
          event: 'workspace.subscribe',
          requestId: `subscribe-${index}`,
          data: { workspaceId: 'workspace-1' },
        }),
      );
      await acknowledgement;
    }

    const firstMessages: OutboundMessage[] = [];
    const secondMessages: OutboundMessage[] = [];
    const otherMessages: OutboundMessage[] = [];
    first.on('message', (raw) => firstMessages.push(JSON.parse(raw.toString())));
    second.on('message', (raw) => secondMessages.push(JSON.parse(raw.toString())));
    other.on('message', (raw) => otherMessages.push(JSON.parse(raw.toString())));

    realtimeServer.leaveUserChannel('user-1', 'workspace:workspace-1');
    realtimeServer.publish('workspace:workspace-1', 'workspace.changed', {
      id: 'change-1',
    });
    await delay(20);

    assert.equal(firstMessages.length, 0);
    assert.equal(secondMessages.length, 0);
    assert.equal(otherMessages.length, 1);

    realtimeServer.clearChannel('workspace:workspace-1');
    realtimeServer.publish('workspace:workspace-1', 'workspace.changed', {
      id: 'change-2',
    });
    await delay(20);
    assert.equal(otherMessages.length, 1);

    first.close();
    second.close();
    other.close();
  });

  it('expires an authenticated connection when its access token expires', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(
      serverOptions(() => validPrincipal('user-1', 150)),
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'http://app.test',
    });
    await opened(socket);

    const readyMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'auth.authenticate',
        data: { accessToken: 'short-lived-token' },
      }),
    );
    assert.equal((await readyMessage).event, 'system.ready');

    const expirationMessage = nextMessage(socket);
    const socketClosed = closed(socket);
    const error = await expirationMessage;
    assert.deepEqual(error, {
      v: 1,
      event: 'system.error',
      data: {
        code: 'ACCESS_TOKEN_EXPIRED',
        message: 'The access token expired',
        retryable: true,
      },
    });
    assert.deepEqual(await socketClosed, {
      code: 4401,
      reason: 'Access token expired',
    });
    assert.equal(realtimeServer.connectionCount, 0);
  });

  it('acknowledges an admitted handler before closing for token expiry', async () => {
    httpServer = createServer();
    const started = deferred();
    const release = deferred();
    realtimeServer = new RealtimeServer(
      serverOptions(() => validPrincipal('user-1', 150)),
    );
    realtimeServer.register(
      'example.delayed',
      z.object({ value: z.string() }),
      async (_context, data) => {
        started.resolve();
        await release.promise;
        return data;
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    const outcome = messagesUntilClose(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.delayed',
        requestId: 'delayed-request',
        data: { value: 'committed' },
      }),
    );
    await started.promise;
    await delay(220);
    assert.equal(socket.readyState, WebSocket.OPEN);

    release.resolve();
    assert.deepEqual(await outcome, {
      messages: [
        {
          v: 1,
          event: 'system.ack',
          requestId: 'delayed-request',
          data: {
            event: 'example.delayed',
            result: { value: 'committed' },
          },
        },
        {
          v: 1,
          event: 'system.error',
          data: {
            code: 'ACCESS_TOKEN_EXPIRED',
            message: 'The access token expired',
            retryable: true,
          },
        },
      ],
      code: REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED,
      reason: 'Access token expired',
    });
  });

  it('returns an admitted handler error before closing for token expiry', async () => {
    httpServer = createServer();
    const started = deferred();
    const release = deferred();
    realtimeServer = new RealtimeServer(
      serverOptions(() => validPrincipal('user-1', 120)),
    );
    realtimeServer.register(
      'example.delayed-failure',
      z.object({}),
      async () => {
        started.resolve();
        await release.promise;
        throw new Error('private failure');
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    const outcome = messagesUntilClose(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.delayed-failure',
        requestId: 'failure-request',
        data: {},
      }),
    );
    await started.promise;
    await delay(180);
    assert.equal(socket.readyState, WebSocket.OPEN);

    release.resolve();
    const result = await outcome;
    assert.deepEqual(result.messages, [
      {
        v: 1,
        event: 'system.error',
        requestId: 'failure-request',
        data: {
          code: 'HANDLER_FAILED',
          message: 'The realtime event could not be handled',
          retryable: true,
        },
      },
      {
        v: 1,
        event: 'system.error',
        data: {
          code: 'ACCESS_TOKEN_EXPIRED',
          message: 'The access token expired',
          retryable: true,
        },
      },
    ]);
    assert.equal(result.code, REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED);
  });

  it('replaces the access token expiry when authentication is refreshed', async () => {
    httpServer = createServer();
    let refreshedExpiresAt = 0;
    realtimeServer = new RealtimeServer(
      serverOptions((token) => {
        if (token === 'initial-token') {
          return { userId: 'user-1', expiresAt: Date.now() + 300 };
        }
        if (token === 'refreshed-token') {
          refreshedExpiresAt = Date.now() + 5_000;
          return { userId: 'user-1', expiresAt: refreshedExpiresAt };
        }
        throw new Error('invalid token');
      }),
    );
    realtimeServer.register(
      'example.echo',
      z.object({ value: z.string() }),
      (_context, data) => data,
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'http://app.test',
    });
    await opened(socket);

    const readyMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'auth.authenticate',
        data: { accessToken: 'initial-token' },
      }),
    );
    assert.equal((await readyMessage).event, 'system.ready');

    const refreshAcknowledgement = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'auth.refresh',
        requestId: 'refresh-request',
        data: { accessToken: 'refreshed-token' },
      }),
    );
    assert.deepEqual(await refreshAcknowledgement, {
      v: 1,
      event: 'system.ack',
      requestId: 'refresh-request',
      data: {
        event: 'auth.refresh',
        result: {
          accessTokenExpiresAt: new Date(refreshedExpiresAt).toISOString(),
        },
      },
    });

    await delay(400);
    const echoAcknowledgement = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.echo',
        requestId: 'echo-request',
        data: { value: 'still-connected' },
      }),
    );
    assert.deepEqual(await echoAcknowledgement, {
      v: 1,
      event: 'system.ack',
      requestId: 'echo-request',
      data: {
        event: 'example.echo',
        result: { value: 'still-connected' },
      },
    });

    socket.close();
  });

  it('uses a terminal close code when disconnecting a user session', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    const socketClosed = closed(socket);
    realtimeServer.disconnectUser('user-1', 'Session revoked');

    assert.deepEqual(await socketClosed, {
      code: REALTIME_CLOSE_CODE.SESSION_TERMINATED,
      reason: 'Session revoked',
    });
  });

  it('uses the rate-limit close code when a connection exceeds its allowance', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(
      serverOptions(() => validPrincipal(), {
        maxMessagesPerMinute: 1,
      }),
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    const outcome = messagesUntilClose(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.excess',
        data: {},
      }),
    );

    assert.deepEqual(await outcome, {
      messages: [
        {
          v: 1,
          event: 'system.error',
          data: {
            code: 'RATE_LIMITED',
            message: 'Too many realtime messages',
            retryable: true,
          },
        },
      ],
      code: REALTIME_CLOSE_CODE.RATE_LIMITED,
      reason: 'Message rate limit exceeded',
    });
  });

  it('emits authenticated and disconnected lifecycle snapshots', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));

    let resolveAuthenticated!: (info: RealtimeConnectionInfo) => void;
    const authenticated = new Promise<RealtimeConnectionInfo>((resolve) => {
      resolveAuthenticated = resolve;
    });
    let resolveDisconnected!: (info: RealtimeConnectionDisconnectedInfo) => void;
    const disconnected = new Promise<RealtimeConnectionDisconnectedInfo>((resolve) => {
      resolveDisconnected = resolve;
    });
    realtimeServer.onConnectionAuthenticated(resolveAuthenticated);
    realtimeServer.onConnectionDisconnected(resolveDisconnected);
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'http://app.test',
    });
    await opened(socket);

    const readyMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'auth.authenticate',
        data: { accessToken: 'valid-token' },
      }),
    );
    const ready = await readyMessage;
    const authenticatedInfo = await authenticated;
    assert.equal(authenticatedInfo.connectionId, (ready.data as { connectionId: string }).connectionId);
    assert.equal(authenticatedInfo.userId, 'user-1');
    assert.ok(authenticatedInfo.accessTokenExpiresAt > authenticatedInfo.authenticatedAt);

    const socketClosed = closed(socket);
    socket.close(1000, 'test complete');
    await socketClosed;
    const disconnectedInfo = await disconnected;
    assert.deepEqual(disconnectedInfo, {
      ...authenticatedInfo,
      code: 1000,
      reason: 'test complete',
    });
  });

  it('drains an admitted handler before closing realtime dependencies', async () => {
    httpServer = createServer();
    const started = deferred();
    const release = deferred();
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));
    realtimeServer.register(
      'example.shutdown-work',
      z.object({}),
      async () => {
        started.resolve();
        await release.promise;
        return { completed: true };
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    const outcome = messagesUntilClose(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.shutdown-work',
        requestId: 'shutdown-request',
        data: {},
      }),
    );
    await started.promise;

    let closeResolved = false;
    const realtimeClosed = realtimeServer.close().then(() => {
      closeResolved = true;
    });
    await delay(30);
    assert.equal(closeResolved, false);
    assert.equal(socket.readyState, WebSocket.OPEN);

    release.resolve();
    const result = await outcome;
    await realtimeClosed;
    assert.deepEqual(result.messages, [
      {
        v: 1,
        event: 'system.ack',
        requestId: 'shutdown-request',
        data: {
          event: 'example.shutdown-work',
          result: { completed: true },
        },
      },
    ]);
    assert.equal(result.code, 1001);
    assert.equal(closeResolved, true);
  });

  it('bounds shutdown drain time when an accepted handler does not settle', async () => {
    httpServer = createServer();
    const started = deferred();
    const release = deferred();
    const finished = deferred();
    realtimeServer = new RealtimeServer(
      serverOptions(() => validPrincipal(), {
        shutdownDrainTimeoutMs: 40,
      }),
    );
    realtimeServer.register(
      'example.stuck-shutdown-work',
      z.object({}),
      async () => {
        started.resolve();
        await release.promise;
        finished.resolve();
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.stuck-shutdown-work',
        data: {},
      }),
    );
    await started.promise;

    const closeStartedAt = Date.now();
    await realtimeServer.close();
    const closeDurationMs = Date.now() - closeStartedAt;

    assert.ok(closeDurationMs >= 30);
    assert.ok(closeDurationMs < 1_500);
    assert.notEqual(socket.readyState, WebSocket.OPEN);

    release.resolve();
    await finished.promise;
  });

  it('orders and drains async lifecycle work for each connection', async () => {
    httpServer = createServer();
    const authenticatedStarted = deferred();
    const releaseAuthenticated = deferred();
    const disconnectedStarted = deferred();
    const releaseDisconnected = deferred();
    const lifecycleOrder: string[] = [];
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));
    realtimeServer.onConnectionAuthenticated(async () => {
      lifecycleOrder.push('authenticated:start');
      authenticatedStarted.resolve();
      await releaseAuthenticated.promise;
      lifecycleOrder.push('authenticated:end');
    });
    realtimeServer.onConnectionDisconnected(async () => {
      lifecycleOrder.push('disconnected:start');
      disconnectedStarted.resolve();
      await releaseDisconnected.promise;
      lifecycleOrder.push('disconnected:end');
    });
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    await authenticatedStarted.promise;
    const socketClosed = closed(socket);
    socket.close();
    await socketClosed;

    let closeResolved = false;
    const realtimeClosed = realtimeServer.close().then(() => {
      closeResolved = true;
    });
    await delay(30);
    assert.equal(closeResolved, false);
    assert.deepEqual(lifecycleOrder, ['authenticated:start']);

    releaseAuthenticated.resolve();
    await disconnectedStarted.promise;
    assert.equal(closeResolved, false);
    assert.deepEqual(lifecycleOrder, [
      'authenticated:start',
      'authenticated:end',
      'disconnected:start',
    ]);

    releaseDisconnected.resolve();
    await realtimeClosed;
    assert.equal(closeResolved, true);
    assert.deepEqual(lifecycleOrder, [
      'authenticated:start',
      'authenticated:end',
      'disconnected:start',
      'disconnected:end',
    ]);
  });

  it('does not let a delayed handler join a channel after disconnect', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));

    let handlerStartedResolve!: () => void;
    const handlerStarted = new Promise<void>((resolve) => {
      handlerStartedResolve = resolve;
    });
    let releaseHandler!: () => void;
    const handlerReleased = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let handlerFinishedResolve!: () => void;
    const handlerFinished = new Promise<void>((resolve) => {
      handlerFinishedResolve = resolve;
    });
    let joined = false;
    let joinError: unknown;
    realtimeServer.register(
      'workspace.delayed-subscribe',
      z.object({ workspaceId: z.string() }),
      async (context, { workspaceId }) => {
        handlerStartedResolve();
        await handlerReleased;
        try {
          context.join(`workspace:${workspaceId}`);
          joined = true;
        } catch (error) {
          joinError = error;
        } finally {
          handlerFinishedResolve();
        }
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'http://app.test',
    });
    await opened(socket);

    const readyMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'auth.authenticate',
        data: { accessToken: 'valid-token' },
      }),
    );
    await readyMessage;
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'workspace.delayed-subscribe',
        data: { workspaceId: 'workspace-1' },
      }),
    );
    await handlerStarted;

    const socketClosed = closed(socket);
    socket.close();
    await socketClosed;
    releaseHandler();
    await handlerFinished;

    assert.equal(joined, false);
    assert.equal(
      joinError instanceof Error ? joinError.message : '',
      'The realtime connection is no longer active',
    );
  });

  it('returns correlated errors for oversized and non-serializable responses', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(
      serverOptions(() => validPrincipal(), {
        maxOutboundPayloadBytes: 512,
        maxBufferedAmountBytes: 2_048,
      }),
    );
    realtimeServer.register(
      'example.response',
      z.object({ kind: z.enum(['large', 'cyclic', 'small']) }),
      (_context, { kind }) => {
        if (kind === 'large') return { value: 'x'.repeat(1_000) };
        if (kind === 'cyclic') {
          const value: { self?: unknown } = {};
          value.self = value;
          return value;
        }
        return { value: 'ok' };
      },
    );
    realtimeServer.register(
      'example.large-error',
      z.object({}),
      () => {
        throw new RealtimeError(
          'X'.repeat(1_000),
          'Y'.repeat(1_000),
          true,
        );
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);

    const oversizedResponse = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.response',
        requestId: 'large-request',
        data: { kind: 'large' },
      }),
    );
    assert.deepEqual(await oversizedResponse, {
      v: 1,
      event: 'system.error',
      requestId: 'large-request',
      data: {
        code: 'RESPONSE_TOO_LARGE',
        message: 'The realtime response exceeds the payload limit',
        retryable: false,
      },
    });

    const nonSerializableResponse = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.response',
        requestId: 'cyclic-request',
        data: { kind: 'cyclic' },
      }),
    );
    assert.deepEqual(await nonSerializableResponse, {
      v: 1,
      event: 'system.error',
      requestId: 'cyclic-request',
      data: {
        code: 'RESPONSE_NOT_SERIALIZABLE',
        message: 'The realtime response could not be serialized',
        retryable: false,
      },
    });

    const oversizedErrorResponse = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.large-error',
        requestId: 'large-error-request',
        data: {},
      }),
    );
    assert.deepEqual(await oversizedErrorResponse, {
      v: 1,
      event: 'system.error',
      requestId: 'large-error-request',
      data: {
        code: 'HANDLER_ERROR_RESPONSE_INVALID',
        message: 'The realtime handler error could not be represented',
        retryable: false,
      },
    });

    const smallResponse = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.response',
        requestId: 'small-request',
        data: { kind: 'small' },
      }),
    );
    assert.deepEqual(await smallResponse, {
      v: 1,
      event: 'system.ack',
      requestId: 'small-request',
      data: {
        event: 'example.response',
        result: { value: 'ok' },
      },
    });
    socket.close();
  });

  it('closes with resync required when context send cannot serialize data', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(serverOptions(() => validPrincipal()));
    realtimeServer.register(
      'example.push-cyclic',
      z.object({}),
      (context) => {
        const value: { self?: unknown } = {};
        value.self = value;
        context.send('example.cyclic', value);
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const { socket } = await authenticatedSocket(port);
    const socketClosed = closed(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'example.push-cyclic',
        data: {},
      }),
    );

    assert.deepEqual(await socketClosed, {
      code: REALTIME_CLOSE_CODE.RESYNC_REQUIRED,
      reason: 'Realtime state requires resynchronization',
    });
  });

  it('closes with resync required when a published payload is oversized', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer(
      serverOptions(() => validPrincipal(), {
        maxOutboundPayloadBytes: 512,
        maxBufferedAmountBytes: 2_048,
      }),
    );
    realtimeServer.register(
      'workspace.subscribe',
      z.object({ workspaceId: z.string() }),
      (context, { workspaceId }) => {
        context.join(`workspace:${workspaceId}`);
      },
    );
    realtimeServer.attach(httpServer);

    const port = await listen(httpServer);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'http://app.test',
    });
    await opened(socket);

    const readyMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'auth.authenticate',
        data: { accessToken: 'valid-token' },
      }),
    );
    await readyMessage;

    const subscribed = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        event: 'workspace.subscribe',
        requestId: 'subscribe-request',
        data: { workspaceId: 'workspace-1' },
      }),
    );
    await subscribed;

    const socketClosed = closed(socket);
    realtimeServer.publish('workspace:workspace-1', 'example.oversized', {
      value: 'x'.repeat(1_000),
    });
    assert.deepEqual(await socketClosed, {
      code: REALTIME_CLOSE_CODE.RESYNC_REQUIRED,
      reason: 'Realtime state requires resynchronization',
    });
  });
});
