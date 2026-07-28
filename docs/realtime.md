# Realtime/WebSocket foundation

The application exposes a standard WebSocket endpoint at `/ws`. It is a small
event protocol rather than a feature-specific socket, so notifications, board
synchronization, presence, and chat can share the same connection.

## Connection lifecycle

1. The frontend opens `wss://<current-origin>/ws`.
2. It immediately sends `auth.authenticate` with the in-memory access token.
3. The backend verifies the JWT and replies with `system.ready`.
4. The client reconnects with exponential backoff after a network interruption.
5. When authentication fails, the client rotates the refresh session over HTTP
   once, obtains a new access token, and retries the WebSocket connection.
6. Logging out closes the socket. Server shutdown closes all sockets cleanly.

The access token is sent as the first WebSocket message. It is not placed in the
URL, where it could be captured by proxy or access logs. Connections that do not
authenticate within the configured timeout are closed.

## Wire format

All messages are JSON:

```json
{
  "v": 1,
  "event": "feature.action",
  "requestId": "optional-correlation-id",
  "data": {}
}
```

Event names must be namespaced (`feature.action`). When `requestId` is present,
the server returns either `system.ack` or `system.error` with the same ID.
Unsolicited server events do not need a request ID.

## Adding a backend event

Register each event close to its owning feature module. Zod validation happens
before the handler runs.

```ts
import { z } from 'zod';
import { realtime, RealtimeError } from '../../realtime';

realtime.register(
  'workspace.subscribe',
  z.object({ workspaceId: z.string().uuid() }).strict(),
  async (context, { workspaceId }) => {
    const membership = await findMembership(context.userId, workspaceId);
    if (!membership) {
      throw new RealtimeError('FORBIDDEN', 'Workspace access is required');
    }

    context.join(`workspace:${workspaceId}`);
    return { workspaceId };
  },
);
```

Channel membership is deliberately controlled by backend handlers. Never join a
user-provided channel before checking that user's access to the resource.

Services and HTTP controllers can publish after a committed change:

```ts
realtime.publish(`workspace:${workspaceId}`, 'card.updated', card);
realtime.sendToUser(userId, 'notification.created', notification);
```

For multiple backend replicas, keep this public API and replace or augment the
in-memory channel delivery with a Redis Pub/Sub adapter. Redis is already part
of the deployment, so feature modules do not need to change when that adapter
is introduced.

## Adding a frontend event

Augment the event maps in `frontend/src/services/realtime/protocol.ts`:

```ts
export interface RealtimeServerEvents {
  'card.updated': Card;
}

export interface RealtimeClientEvents {
  'workspace.subscribe': { workspaceId: string };
}
```

Then subscribe and clean up with the returned function:

```ts
const unsubscribe = realtime.on('card.updated', (card) => {
  // update the local store
});

await realtime.request('workspace.subscribe', { workspaceId });
unsubscribe();
```

The singleton connection is started after login and closed after logout from
`frontend/src/main.ts`.

## Built-in behavior

- `system.ping`: request/response smoke test; the acknowledgement contains the
  server time.
- Server ping/pong frames every 30 seconds detect dead connections.
- Invalid payloads, unknown events, handler failures, and request timeouts use
  stable error envelopes.
- Default limits are 64 KiB per message and 120 messages per minute per
  connection.
- Nginx keeps upgraded connections open beyond two heartbeat intervals.

Configuration is available through `WS_AUTH_TIMEOUT_MS`,
`WS_HEARTBEAT_INTERVAL_MS`, `WS_MAX_PAYLOAD_BYTES`, and
`WS_MAX_MESSAGES_PER_MINUTE`. The `/ws` path is shared by the backend, frontend,
and Nginx configuration and is intentionally kept as one deployment contract.
