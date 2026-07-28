import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { RealtimeMessage } from './protocol';
import { RealtimeServer } from './server';

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

function nextMessage(socket: WebSocket): Promise<RealtimeMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', (raw) => {
      try {
        resolve(JSON.parse(raw.toString()) as RealtimeMessage);
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', reject);
  });
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

  it('authenticates, dispatches typed events, and publishes to joined channels', async () => {
    httpServer = createServer();
    realtimeServer = new RealtimeServer({
      path: '/ws',
      allowedOrigin: 'http://app.test',
      authTimeoutMs: 1_000,
      heartbeatIntervalMs: 10_000,
      maxPayloadBytes: 4_096,
      maxMessagesPerMinute: 10,
      authenticateAccessToken: (token) => {
        if (token !== 'valid-token') throw new Error('invalid token');
        return 'user-1';
      },
    });
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
    const readyData = ready.data as {
      connectionId: string;
      userId: string;
      protocolVersion: number;
      serverTime: string;
    };
    assert.equal(ready.event, 'system.ready');
    assert.match(readyData.connectionId, /^[0-9a-f-]{36}$/);
    assert.equal(readyData.userId, 'user-1');
    assert.equal(readyData.protocolVersion, 1);
    assert.equal(Number.isNaN(Date.parse(readyData.serverTime)), false);

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
});
