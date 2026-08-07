# Friends prototype

The friend feature uses an explicit request and acceptance flow:

1. A user sends a request to an existing account by email.
2. The receiver accepts or rejects it from the Friends pane in the floating
   messenger.
3. Only acceptance creates a `Friendships` row.
4. Accepted friends can see each other's current online/offline state.

The sender may cancel an outgoing request. Either user may remove an accepted
friendship.

## Data model

`FriendRequests` stores only pending requests. The two participant IDs are
sorted into a canonical composite key, so only one pending request can exist
between the same two users in either direction. `requested_by_id` identifies
the sender.

`Friendships` stores only accepted, undirected relationships and uses the same
canonical pair. Accepting a request deletes the pending row and creates the
friendship in one transaction. Rejecting or cancelling simply deletes the
pending row; this Toy prototype does not retain request history.

`DirectMessages` stores append-only 1:1 messages. There is no separate
conversation row or read-receipt state in this prototype. Removing a
friendship keeps existing rows for data integrity but immediately blocks their
API access.

## HTTP API

All endpoints require a Bearer access token.

```text
GET    /api/friends
GET    /api/friends/requests
POST   /api/friends/requests
       { "email": "friend@example.com" }
POST   /api/friends/requests/:friendUserId/accept
DELETE /api/friends/requests/:friendUserId
GET    /api/friends/:friendUserId/messages
POST   /api/friends/:friendUserId/messages
       { "content": "message, 1 to 1000 characters" }
DELETE /api/friends/:friendUserId
```

The request list response separates direction:

```json
{
  "incoming": [
    {
      "id": "sender-user-id",
      "name": "Sender",
      "profile_image_url": null,
      "requested_at": "2026-07-29T00:00:00.000Z"
    }
  ],
  "outgoing": []
}
```

The `id` in a request item is the other user's ID. The shared DELETE endpoint
rejects an incoming request or cancels an outgoing request because the current
user is necessarily one participant in that canonical pair.

Friend responses include an `online` boolean. It is a process-local realtime
snapshot, not a stored database field or `last_seen` history. Pending requests
never participate in presence notifications.

## UI

The movable messenger has a conversation directory for the user's accepted
friends and joined workspaces. Selecting a friend opens a DM. Selecting a
workspace room also navigates to that workspace so its normal realtime
subscription is active. The personal Inbox remains separate from conversation
controls: it appears as a left split sidebar beside Board or Calendar on
desktop and a focused full-page view on mobile.

Friend management supports:

- sending a request by email;
- accepting or rejecting received requests;
- cancelling sent requests;
- listing and removing accepted friends;
- observing accepted friends' realtime online status.

`dm.message_created` is delivered to both participants' active connections.
The sender merges the REST response and WebSocket echo by message ID.

On narrow screens, the workspace bottom bar replaces the separate floating
launcher for chat and opens the messenger as a full-page view above that bar.
The workspace list also keeps its Chat bottom-bar item active, so the full
directory remains reachable without entering a workspace first.

Request received/accepted events are not pushed in this slice. The pane reloads
when first opened and after WebSocket reconnection, and also provides a
manual refresh button. The legacy `/friends` URL redirects to `/workspaces`
with friend management open instead of rendering a separate page. Blocking,
request history, read receipts, typing indicators, and attachments remain
outside the Toy scope.
