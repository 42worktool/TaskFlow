# Friends prototype

The friend feature uses an explicit request and acceptance flow:

1. A user sends a request to an existing account by email.
2. The receiver accepts or rejects it from the toggleable Friends sidebar.
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

## HTTP API

All endpoints require a Bearer access token.

```text
GET    /api/friends
GET    /api/friends/requests
POST   /api/friends/requests
       { "email": "friend@example.com" }
POST   /api/friends/requests/:friendUserId/accept
DELETE /api/friends/requests/:friendUserId
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

The authenticated application header toggles the Friends sidebar for:

- sending a request by email;
- accepting or rejecting received requests;
- cancelling sent requests;
- listing and removing accepted friends;
- observing accepted friends' realtime online status.

Request received/accepted events are not pushed in this slice. The sidebar
reloads when opened and after WebSocket reconnection, and also provides a
manual refresh button. The legacy `/friends` URL redirects to `/workspaces`
with the sidebar open instead of rendering a separate page. Blocking and
request history remain outside the Toy scope.
