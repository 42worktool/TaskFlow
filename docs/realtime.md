# Realtime/WebSocket foundation

The application exposes a standard WebSocket endpoint at `/ws`. It uses a small,
versioned event protocol rather than a feature-specific socket so presence,
workspace synchronization, notifications, and chat can share one connection.

## Prototype scope

This is a toy-project foundation, not a production gateway. Keep the core
connection lifecycle and extension points easy to review. Distributed
rate-limiting, per-user connection quotas, broker abstractions, and a shared
contract package should be added only when a concrete feature or deployment
requires them.

The first feature slice is `notification.created`. When an invited user joins a
workspace, the backend sends one update notification to each currently
connected existing member. The frontend keeps the most recent 50 events in
memory and clears them when the session ends or changes user. There is
intentionally no notification history or persisted read state yet; those
belong in a later PostgreSQL-backed notification feature if the project needs
them.

Friend presence is the second small slice. `GET /api/friends` returns an
in-memory online snapshot, and the server emits `friend.presence_changed` only
when a user gains their first authenticated socket or loses their last one.
There is no persisted `last_seen`, device count, grace period, or presence
subscription request.

Workspace realtime is the third slice. Active members subscribe to a
`workspace:<id>` channel. Successful REST mutations publish a compact
`workspace.changed` invalidation hint after the database commit, and the
browser refetches the affected list snapshots. `workspace.message_created`
delivers PostgreSQL-backed group-chat messages, while
`workspace.member_presence_changed` carries first-connect/last-disconnect
presence transitions. Public non-members can still read public boards through
REST, but cannot subscribe to the member channel or use chat.

The invalidation event is intentionally not a durable mutation stream. The
browser treats REST as canonical and performs a full workspace/board/chat
snapshot refresh after every successful reconnect.

## Connection and authentication lifecycle

1. The frontend opens `wss://<current-origin>/ws` and sends
   `auth.authenticate` with its in-memory access token as the first message.
2. The backend verifies the JWT and returns `system.ready` with the connection
   and user IDs, server time, protocol version, and `accessTokenExpiresAt`.
3. The client normally rotates the HTTP session before that ISO timestamp and
   sends the new token through `auth.refresh` on the existing socket. The new
   token must belong to the same user. The default refresh lead is 30 seconds;
   for shorter-lived tokens it is capped at half of the remaining lifetime.
   Scheduling uses `serverTime` so a skewed browser clock does not refresh late.
4. If the token reaches its deadline, the server sends
   `ACCESS_TOKEN_EXPIRED` when possible and closes with `4401`. The client then
   performs one forced HTTP refresh and immediate reconnect for that
   authentication-failure cycle. A repeated `4401` is terminal.
5. Transient network and server failures reconnect with exponential backoff.
   A socket that does not produce a valid `system.ready` within the client
   handshake deadline (15 seconds by default), or emits a transport error, is
   abandoned so the connection lifecycle can move on to its next retry.
   Explicit logout calls `disconnect()`, closes with `1000`, clears
   session-specific subscription recovery, and does not reconnect.

Tokens are never put in the URL, where proxies or access logs could retain
them. Connections that do not authenticate within `WS_AUTH_TIMEOUT_MS` are
closed. Browser upgrades must also carry the exact configured `APP_ORIGIN`;
missing and mismatched Origin headers are rejected. The expiry fallback still
matters for suspended tabs and delayed browser timers even though proactive
refresh is the normal path. A transient HTTP or `5xx` refresh failure preserves
the current local session; only an invalid refresh session (`401`/`403`) clears
it.

## Wire format

Every application message is JSON:

```json
{
  "v": 1,
  "event": "feature.action",
  "requestId": "optional-correlation-id",
  "data": {}
}
```

Event names must be namespaced (`feature.action`). A request with `requestId`
receives either `system.ack` or `system.error` with the same ID. Unsolicited
server events do not need an ID. The acknowledgement also identifies the event
being acknowledged; the client rejects a mismatched acknowledgement. The same
event-name rule is enforced for server publish APIs and by the frontend parser.
The protocol reserves `auth.authenticate`, `auth.refresh`, `system.ready`,
`system.ack`, and `system.error`; feature handlers and public publish/send APIs
reject those names so an application event cannot be mistaken for lifecycle
control. `system.ping` remains an ordinary typed request.

`requestId` is a correlation ID, not an exactly-once guarantee. The server lets
a handler admitted with a valid token finish and attempts its acknowledgement
before closing an expired connection. A network failure can still hide an
acknowledgement after a mutation committed, so retries are effectively
at-least-once. Mutating feature events must carry a domain idempotency or
operation ID and enforce its uniqueness in durable storage.

## Close-code policy

| Code | Meaning | Client policy |
| --- | --- | --- |
| `1000` | Intentional close | Terminal; do not reconnect |
| `1001` | Server shutdown | Reconnect with backoff and recover state |
| `1002`, `1003`, `1008`, `1009` | Protocol, message type, policy, or size bug | Terminal; fix the client |
| `1011` | Internal processing or delivery failure | Reconnect with backoff |
| `1013` | The client is consuming outbound data too slowly | Wait 5 seconds, reconnect, and recover |
| `4401` | Authentication is missing, invalid, or expired | Force HTTP refresh once; stop on repeat |
| `4403` | The session was explicitly terminated | Terminal; do not refresh automatically |
| `4410` | An event could not be delivered and durable state may have a gap | Reconnect with backoff and resynchronize |
| `4429` | Per-connection message limit exceeded | Wait 60 seconds before reconnecting |

`system.error` carries the more specific application error when it can be
delivered. Neither the error nor the close frame is guaranteed during a network
failure, so correctness must rely on durable state and cursor recovery rather
than receiving a particular final frame.

The table describes codes received from the server. Browsers only permit clients
to send `1000` or application-defined `3000`–`4999` codes, so locally detected
protocol failures use the corresponding `4002`, `4003`, `4008`, or `4009`
application code. Public `disconnect()` calls normalize unsupported codes and
close reasons longer than the WebSocket 123-byte limit.

## Adding a backend event

Register each event close to its owning feature module. Zod validation happens
before the handler runs.

```ts
import { z } from 'zod';
import { realtime, RealtimeError } from '../../realtime';

realtime.register(
  'workspace.subscribe',
  z.object({ workspace_id: z.string().uuid() }).strict(),
  async (context, { workspace_id }) => {
    const membership = await findMembership(context.userId, workspace_id);
    if (!membership) {
      throw new RealtimeError(
        'WORKSPACE_ACCESS_REQUIRED',
        'Active workspace membership is required',
      );
    }

    context.join(`workspace:${workspace_id}`);
    return {
      workspace_id,
      online_user_ids: await onlineMemberIds(workspace_id),
    };
  },
);
```

Channel membership is controlled only by backend handlers. Never join a
user-provided channel before checking access to the resource. Publish only
after the durable transaction commits:

```ts
realtime.publish(`workspace:${workspaceId}`, 'card.updated', event);
realtime.sendToUser(userId, 'notification.created', notification);
```

`publish()` and `sendToUser()` are process-local transports, and their payload
parameter is currently `unknown`. Before a feature event is introduced, define
its outbound Zod schema beside the owning module, validate before publishing,
and mirror the contract in the frontend event map. A shared contract package is
the intended next step once the Docker build contexts are consolidated.

An oversized or non-serializable request result receives a correlated small
error. If an unsolicited application event cannot be represented within the
delivery contract, the affected connection closes with `4410` instead of
silently continuing with an unknown gap.

## Adding frontend types and recovery

Extend all three maps in
`frontend/src/services/realtime/protocol.ts` so outbound data, inbound data, and
request results remain distinct:

```ts
export interface RealtimeServerEvents {
  'workspace.changed': WorkspaceChangedEvent;
}

export interface RealtimeClientEvents {
  'workspace.subscribe': { workspace_id: string };
}

export interface RealtimeClientRequestResults {
  'workspace.subscribe': {
    workspace_id: string;
    online_user_ids: string[];
  };
}
```

`realtime.on()` installs a local listener; it does not preserve server channel
membership. Every new socket starts without channels. Register the subscription
intent under a stable feature key and reconcile durable state in the recovery
callback:

```ts
const removeRecovery = realtime.registerSubscriptionRecovery(
  `workspace:${workspaceId}`,
  async () => {
    await realtime.request('workspace.subscribe', {
      workspace_id: workspaceId,
    });
    await refreshWorkspace();
    await refreshBoard();
    await refreshChat();
  },
);

const unsubscribe = realtime.on('workspace.changed', scheduleTargetedRefresh);

// Component cleanup
unsubscribe();
removeRecovery();
await realtime.request('workspace.unsubscribe', {
  workspace_id: workspaceId,
});
```

Listener invocation follows wire arrival order, but asynchronous listener
completion is not serialized. Apply ordered state changes synchronously, or put
bursts through a small feature-owned debounce/merge queue.

The recovery callback runs once after each new valid `system.ready`, and also
runs when registered on an already-connected client. It must re-subscribe and
then reload canonical HTTP snapshots. Live events can interleave with that
response, so the workspace feature merges presence deltas and deduplicates chat
messages by ID. Callback failures are logged; feature code owns any
same-connection retry. Explicit `disconnect()` clears all registered recovery
intents to prevent one user's private subscriptions from being replayed in
another session.

## Presence hooks and multiple replicas

Presence-like services can register
`onConnectionAuthenticated()` and `onConnectionDisconnected()` observers.
Snapshots include connection/user IDs and authentication timestamps; a
disconnect also includes its code and reason. Each registration returns a
removal function. Listener failures are isolated and
authenticated/disconnected phases are ordered per connection. Graceful shutdown
waits for accepted handlers and lifecycle work before closing database and Redis
connections, up to a 5-second realtime drain deadline by default; one stuck
observer therefore cannot block process shutdown forever.

Presence must aggregate active connection IDs rather than store one boolean
because a user can have multiple tabs or devices. These indexes, channels,
hooks, `publish()`, and `sendToUser()` are currently local to one backend
process. Before adding replicas, route cross-process events through Redis
Pub/Sub and keep presence connection IDs in Redis with heartbeat/TTL cleanup.
PostgreSQL remains the durable source for messages and workspace state, and
HTTP snapshot recovery remains the repair path.

The current friend implementation follows that process-local model. A first
connection sends `online: true` to current friends, a last disconnect sends
`online: false`, and intermediate tab changes emit nothing. Events are
best-effort; opening the Friends sidebar and reconnecting both refresh the
authoritative snapshot through `GET /api/friends`.

## Limits and configuration

- The inbound frame limit defaults to 64 KiB.
- The complete serialized outbound envelope also defaults to 64 KiB on both
  client and server. Client `send()` throws `RealtimeSendError`; `request()`
  rejects it instead of losing the message silently.
- The outbound buffer threshold defaults to 256 KiB. The browser rejects a new
  send while above its threshold; the server closes a slow recipient with
  `1013`.
- The server permits 120 messages per minute per connection by default. The
  allowance is checked when a frame arrives, before it is appended to the
  serialized handler chain, so that chain is bounded by the same allowance.
- Ping/pong frames every 30 seconds detect dead connections, and Nginx keeps
  upgraded connections open beyond two heartbeat intervals.

Server environment configuration uses `WS_AUTH_TIMEOUT_MS`,
`WS_HEARTBEAT_INTERVAL_MS`, `WS_MAX_PAYLOAD_BYTES`, and
`WS_MAX_MESSAGES_PER_MINUTE`. `maxOutboundPayloadBytes`,
`maxBufferedAmountBytes`, and `shutdownDrainTimeoutMs` are programmatic
`RealtimeServerOptions` overrides.
The frontend exposes corresponding client options plus reconnect cooldown,
request timeout, `handshakeTimeoutMs`, and `authenticationRefreshLeadMs`
overrides.

The `/ws` path and protocol version are shared deployment contracts. The
backend and frontend keep separate TypeScript declarations because their Docker
build contexts are separate; contract tests and this document must change
together whenever the wire format changes.
