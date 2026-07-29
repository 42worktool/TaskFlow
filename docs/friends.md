# Friends prototype

The current friend feature is intentionally small and global:

- Add an existing user by email.
- List the signed-in user's friends.
- Remove a friend from either side of the relationship.
- Show whether each friend currently has an authenticated realtime connection.

`Friendships` stores one undirected row per pair. The service sorts both user
IDs before every write, and PostgreSQL enforces the same ordering with a check
constraint. Repeating an add is idempotent.

## HTTP API

All endpoints require a Bearer access token.

```text
GET    /api/friends
POST   /api/friends                 { "email": "friend@example.com" }
DELETE /api/friends/:friendUserId
```

Friend responses include an `online` boolean. It is a process-local realtime
snapshot, not a stored database field or `last_seen` history.

This Toy scope does not include friend requests, acceptance, or blocking.
Those can be added without changing the canonical friendship pair. The Account
page is the temporary management UI; it can move to a dedicated social page
when DM is introduced.
