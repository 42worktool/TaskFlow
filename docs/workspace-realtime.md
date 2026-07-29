# Workspace realtime prototype

Workspace realtime uses the existing authenticated `/ws` connection. It keeps
the WebSocket payloads small and treats REST/PostgreSQL as the source of truth.

## Channel lifecycle

Only an active workspace member can subscribe:

```text
workspace.subscribe   { "workspace_id": "<uuid>" }
workspace.unsubscribe { "workspace_id": "<uuid>" }
```

The subscribe acknowledgement contains the workspace ID and the currently
online member IDs. The Vue workspace layout owns the subscription, restores it
after reconnect, and explicitly unsubscribes when the route changes.

Removing a member evicts all of that user's connections from the workspace
channel. Deleting a workspace clears the channel after publishing the final
deletion hint.

## Targeted synchronization

Every successful workspace/list/card mutation publishes `workspace.changed`
after its database write or transaction completes:

```json
{
  "event_id": "uuid",
  "workspace_id": "uuid",
  "entity": "card",
  "action": "moved",
  "entity_id": "card-uuid",
  "list_ids": ["source-list-uuid", "target-list-uuid"],
  "actor_user_id": "uuid",
  "occurred_at": "2026-07-29T00:00:00.000Z"
}
```

The event is an invalidation hint, not replacement application data.

- Workspace/member events reload `GET /api/workspaces/:workspaceId`.
- List and card events reload only the IDs in `list_ids` through
  `GET /api/lists/:listId`.
- A deleted list is removed locally.
- An open matching card detail reloads only when the form has no unsaved input.
- Reconnect reloads the complete board snapshot to repair any missed events.

The board and calendar merge bursts for a short interval. Board refresh waits
until drag-and-drop finishes, so a remote update cannot interrupt an active
drag. Events from the actor are not excluded because another tab for the same
account still needs them.

Subscription and reconnect snapshot requests make at most two short retries
after a transient failure. This repairs brief outages without creating a
permanent retry loop in the prototype.

## Workspace chat

Each workspace has one implicit group chat. A separate room table is not needed
for this prototype.

```text
GET  /api/workspaces/:workspaceId/messages
POST /api/workspaces/:workspaceId/messages
     { "content": "message, 1 to 1000 characters" }
```

Both endpoints require active membership; all roles including `VIEWER` may
read and send. A public non-member cannot access chat.

The backend stores the message first, returns it from the POST request, then
publishes the same DTO as `workspace.message_created`. Clients deduplicate by
message ID, so the sender's HTTP response and WebSocket echo do not create two
rows. The latest 100 messages are reloaded on entry and reconnect.

Message editing/deletion, read receipts, typing indicators, attachments,
pagination, extra rooms, and direct messages are outside this slice.

## Team presence

`workspace.member_presence_changed` contains:

```json
{
  "workspace_id": "uuid",
  "user_id": "uuid",
  "online": true
}
```

Online means the user has at least one authenticated application WebSocket,
not necessarily that the workspace tab is focused. The first connection emits
online and the last disconnection emits offline; opening or closing an
intermediate tab does not change status.

Channels and presence are process-local. Multiple backend replicas require
Redis Pub/Sub and shared presence leases before this contract can be considered
distributed.
