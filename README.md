*This project has been created as part of the 42 curriculum by ynam, chakim, yeonjuki, injo, wchoe.*

# TaskFlow

## Description

TaskFlow is a Trello-inspired collaboration prototype for organizing work in
role-based workspaces. It combines a Kanban board, a personal card inbox,
calendar views, invitations, workspace chat, presence, and realtime
synchronization in one Docker Compose application.

The project intentionally favors a compact, reviewable prototype over a
production-scale platform. Realtime transport is isolated behind a versioned
WebSocket protocol so future features can be added without coupling them to the
HTTP controllers or the Vue component tree.

### Key features

- Email/password authentication and Google OAuth 2.0 login.
- Rotating Redis-backed refresh sessions and short-lived JWT access tokens.
- Public and private workspaces with `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER`
  roles.
- Email invitation links bound to the invited account.
- Kanban lists and cards with drag-and-drop reordering.
- Realtime list-level board synchronization across workspace members.
- Editable card titles, descriptions, start dates, and deadlines.
- A personal inbox that can receive cards from a board and return them to a
  selected list.
- Calendar and text search views derived from workspaces the user can access.
- Email-based friend requests with acceptance/rejection and realtime
  online/offline presence for accepted friends.
- A persistent workspace group chat and realtime team-member online status.
- Realtime workspace-member-joined notifications.
- HTTPS and WSS through Nginx, backed by PostgreSQL and Redis.

## Architecture

```mermaid
flowchart LR
    Browser["Vue client"] -->|"HTTPS / WSS"| Nginx["Nginx reverse proxy"]
    Nginx -->|"HTTP"| Frontend["Vite development server"]
    Nginx -->|"/api"| Backend["Express application"]
    Nginx -->|"/ws"| Realtime["Versioned WebSocket gateway"]
    Realtime --> Backend
    Backend --> PostgreSQL["PostgreSQL 15"]
    Backend --> Redis["Redis 7"]
    Backend --> SMTP["SMTP provider"]
    Backend --> Google["Google OAuth"]
```

The REST API and PostgreSQL own durable application state. The realtime layer
authenticates the same users and publishes invalidation hints, chat delivery,
presence, and notification events. Browsers refetch only affected list
snapshots and perform a full snapshot reconciliation after reconnecting. Redis
stores refresh sessions, mail jobs, and invitation rate-limit counters.
Prototype channels and presence are intentionally held in one backend process.

## Instructions

### Prerequisites

- Docker Engine 24 or newer.
- Docker Compose v2.20 or newer.
- A browser that supports WebSockets.
- Google OAuth client credentials to test Google login.
- SMTP credentials to send workspace invitations.

The containers pin the main runtime families used by the project:
Node.js 20, PostgreSQL 15, Redis 7, and Nginx stable Alpine. A host Node.js
installation is only needed when running tests outside Docker.

### 1. Configure the environment

```bash
cp .env.example .env
```

Set every non-default value in `.env`:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Exact registered callback; local default is `https://localhost:4430/oauth/google` |
| `APP_ORIGIN` | Canonical browser origin; local default is `https://localhost:4430` |
| `JWT_ACCESS_SECRET` | Random secret of at least 32 characters |
| `SMTP_HOST`, `SMTP_PORT` | SMTP server and port |
| `SMTP_USER`, `SMTP_PASS` | SMTP credentials |
| `SMTP_FROM` | Sender shown on invitation messages |
| `OAUTH_AUTO_LINK_VERIFIED_EMAIL` | Toy-project option for linking a verified Google email to an existing local user |
| `WS_*` | Optional WebSocket timeout, heartbeat, payload, and rate-limit tuning |

A suitable development JWT secret can be generated with:

```bash
openssl rand -base64 48
```

Placeholder Google and SMTP values are enough to exercise password
authentication and the board locally, but their related integrations will not
work until valid credentials are supplied.

### 2. Register the OAuth callback

Create a Google OAuth 2.0 Web application and add this authorized redirect URI:

```text
https://localhost:4430/oauth/google
```

The canonical backend route
`/api/auth/oauth/callback/google` is also supported. For any external
deployment, register the exact public HTTPS callback and update both
`APP_ORIGIN` and `GOOGLE_REDIRECT_URI`.

### 3. Build and run

```bash
docker compose up -d --build
```

The backend entrypoint generates the Prisma client and applies pending
migrations automatically. Nginx generates a self-signed development
certificate when no certificate is mounted.

Open:

- Application: `https://localhost:4430`
- Health check: `https://localhost:4430/api/health`
- Auth/account Swagger UI: `https://localhost:4430/api/docs/`

The browser will warn about the self-signed local certificate. Accept it only
for this development environment.

Useful lifecycle commands:

```bash
docker compose logs -f
docker compose down
```

`docker compose down -v` removes the local PostgreSQL and Redis volumes and
therefore deletes development data.

### 4. Run checks

```bash
cd backend
npm ci
npm run typecheck
npm test

cd ../frontend
npm ci
npm test
npm run build
```

Backend integration tests create local HTTP and WebSocket listeners, so the
environment running the suite must allow loopback port binding.

## Basic usage

1. Create an account or sign in with Google.
2. Create a private or public workspace.
3. Add lists and cards, then drag them to reorder or move them.
4. Open a card to edit its details and dates.
5. Move a card to the personal inbox and restore it to a board when ready.
6. Invite a registered or future user by email from the workspace share menu.
7. Open the Friends sidebar to send or accept a friend request and view
   accepted friends' connection state.
8. Open the workspace Chat tab to talk with members and see team online status
   in the sidebar.
9. Search cards across accessible workspaces or open Calendar for the current
   workspace.

Workspace permissions are deliberately small:

| Role | Read board | Workspace chat | Edit lists/cards | Invite/manage members | Edit workspace | Delete workspace |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Public non-member | Yes | No | No | No | No | No |
| `VIEWER` | Yes | Yes | No | No | No | No |
| `MEMBER` | Yes | Yes | Yes | No | No | No |
| `ADMIN` | Yes | Yes | Yes | Yes | Yes | No |
| `OWNER` | Yes | Yes | Yes | Yes | Yes | Yes |

The service prevents removing or demoting the final owner.

## Technical stack

| Area | Technology | Why it was selected |
| --- | --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Vue Router | Small component model, strong typing, and fast prototype iteration |
| Styling | Tailwind CSS plus project CSS | Fast layout work while keeping reusable component styles |
| Board interaction | `vuedraggable` | Browser drag-and-drop with a small Vue integration surface |
| Backend | Express 5, TypeScript, Zod | Minimal HTTP framework with explicit validation and readable services |
| Realtime | `ws` with a versioned JSON envelope | Direct control over authentication, heartbeat, routing, and future event handlers |
| ORM | Prisma | Typed PostgreSQL queries, migrations, relations, and transactions |
| Durable storage | PostgreSQL 15 | Relational integrity for workspaces, roles, boards, and audit data |
| Ephemeral storage | Redis 7 | Refresh sessions, mail queue, and invitation throttling |
| Authentication | JWT, Node `scrypt`, Google OAuth/OIDC | Stateless access checks plus revocable sessions and social login |
| Email | Nodemailer | Provider-neutral SMTP invitation delivery |
| Edge/runtime | Nginx and Docker Compose | One HTTPS/WSS entrypoint and reproducible local services |
| Testing | Node test runner and Vitest | Lightweight backend integration/unit tests and frontend behavior tests |

## Database schema

```mermaid
erDiagram
    USER ||--o{ OAUTH_ACCOUNT : owns
    USER ||--o{ WORKSPACE_MEMBER : joins
    WORKSPACE ||--o{ WORKSPACE_MEMBER : contains
    WORKSPACE ||--o{ BOARD_LIST : contains
    BOARD_LIST ||--o{ CARD : contains
    USER ||--o{ CARD : owns_inbox
    USER ||--o{ CARD_MEMBER : assigned
    CARD ||--o{ CARD_MEMBER : has
    WORKSPACE ||--o{ LABEL : defines
    LABEL ||--o{ CARD_LABEL : tags
    CARD ||--o{ CARD_LABEL : tagged
    CARD ||--o{ ATTACHMENT : has
    CARD ||--o{ COMMENT : has
    USER ||--o{ COMMENT : writes
    USER ||--o{ FRIENDSHIP : endpoint
    USER ||--o{ FRIEND_REQUEST : participates
    USER ||--o{ WORKSPACE_MESSAGE : writes
    WORKSPACE ||--o{ WORKSPACE_MESSAGE : contains
    WORKSPACE ||--o{ ACTIVITY_LOG : logical_scope
```

The Prisma models map to plural PostgreSQL table names. `ActivityLogs` is
created by SQL migration and populated by database triggers, so it is not a
Prisma application model.

| Table | Important fields and types | Relationship or rule |
| --- | --- | --- |
| `Users` | `id UUID`, `email String`, `password_hash String?`, `name String`, `profile_image_url String?` | Email is unique; OAuth-only users may have no password hash |
| `OAuthAccounts` | `id UUID`, `user_id UUID`, `provider String`, `provider_id String` | Unique provider/provider ID pair |
| `Friendships` | `user_low_id UUID`, `user_high_id UUID`, `created_at DateTime` | Sorted composite key represents one undirected friendship |
| `FriendRequests` | `user_low_id UUID`, `user_high_id UUID`, `requested_by_id UUID`, `created_at DateTime` | Canonical pending pair; deleted on accept, reject, or cancel |
| `Workspaces` | `id UUID`, `name String`, `is_public Boolean` | Parent of members, lists, and labels |
| `WorkspaceMembers` | `workspace_id UUID`, `user_id UUID`, `role Role` | Composite key; role is `OWNER`, `ADMIN`, `MEMBER`, or `VIEWER` |
| `WorkspaceMessages` | `id UUID`, `workspace_id UUID`, `user_id UUID`, `content Text`, `created_at DateTime` | Append-only messages for the workspace's default group chat |
| `Lists` | `id UUID`, `workspace_id UUID`, `name String`, `sequence Float`, `is_done Boolean` | Fractional sequence supports reordering |
| `Cards` | `id UUID`, `list_id UUID?`, `user_id UUID?`, `title String`, `description Text`, `start_at DateTime?`, `deadline DateTime?`, `sequence Float` | A null `list_id` denotes a personal inbox card |
| `CardMembers` | `card_id UUID`, `user_id UUID` | Composite assignment relation |
| `Labels` | `id UUID`, `workspace_id UUID`, `label_name String`, `label_color String` | Labels are workspace-scoped |
| `CardLabels` | `label_id UUID`, `card_id UUID` | Composite card-to-label relation |
| `Attachments` | `id UUID`, `card_id UUID`, `file_url String?`, `file_name String?` | Stores URL metadata, not uploaded file bytes |
| `Comments` | `id UUID`, `card_id UUID`, `user_id UUID`, `comment_str String` | Card comment records |
| `ActivityLogs` | `id UUID`, `workspace_id UUID`, `actor_user_id UUID?`, `operation enum`, `event_type enum`, `target_type enum`, `target_id Text`, `transaction_id BigInt` | Append-only workspace activity records written by triggers |

Most domain models also carry `created_at/by`, `updated_at/by`, and
`deleted_at/by` audit fields. Soft-deleted rows remain available for audit
history but are filtered from normal application reads.

## Features and contributors

Git history uses several aliases. The table preserves those aliases instead of
guessing an identity where the repository does not prove one.

| Feature | Implementation summary | Repository contributors |
| --- | --- | --- |
| Authentication and account | Password login, Google OAuth, refresh rotation, account edit/delete, OpenAPI | `Sean Kim`; frontend integration by `KHR416` / `wchoe` |
| Workspace and permissions | CRUD, role checks, member removal, final-owner guard, public data projection | `Saususge`, `copilot-swe-agent[bot]`, `seankim96` |
| Email invitations | JWT invitation link, account binding, Redis queue, per-address limit | `Saususge`, `seankim96` |
| Lists and cards | Prisma services, ordering, drag-and-drop, details and dates | `injo`, `yeonjunky`, `KHR416`, `seankim96` |
| Personal inbox | API-backed cards and board/inbox round trip | `seankim96` |
| Calendar and search | Current-workspace calendar plus cross-accessible-workspace text search, with no mock records | `seankim96`, building on the initial UI by `KHR416` |
| Friends and presence | Request/accept flow, symmetric friendships, toggleable Friends sidebar, and online/offline events | `seankim96` |
| Realtime foundation | Authenticated protocol, reconnect, refresh, heartbeat, limits, routing, drain | `seankim96` |
| Workspace realtime and chat | Member-only channels, targeted list reconciliation, team presence, and persistent group chat | `seankim96` |
| Infrastructure | Docker services, HTTPS/WSS Nginx proxy, migrations | `ynam` / `nyhwbh`, `yeonjunky` / `yeonjunkim` |
| Database and activity audit | Core schema, migrations, trigger-based activity log | `injo`, `seankim96` |

## Team information

The project planning document records the following 42 team:

| Login | Role | Main responsibility |
| --- | --- | --- |
| `ynam` | Product Owner | Product direction, requirements, priorities, and initial environment |
| `chakim` | Project Manager | Planning workflow, coordination, workspace/member and invitation workstream |
| `yeonjuki` | Tech Lead | Backend structure, infrastructure decisions, card module, and technical review |
| `injo` | Developer | Relational schema, Prisma list/card services, and drag-and-drop board integration |
| `wchoe` | Developer | Vue UI structure, routing, shared components, API integration, and frontend hardening |

Repository aliases are not perfectly normalized: `ynam` also appears as
`nyhwbh`; `yeonjuki` appears as `yeonjunky`/`yeonjunkim`; `injo` also appears
under a Korean display name; and `wchoe` shares commit history with `KHR416`.
Workspace commits under `Saususge` and integration commits under
`Sean Kim`/`seankim96` are not conclusively mapped to the five planning logins
by files in this repository.

## Project management

- The shared Trello board was the planning source of truth.
- Cards moved through `Backlog` → `To-do` → `WIP` → `Review` → `Done`.
- Contributor-colored labels identified ownership; `Waiting` marked blockers
  and `Stretch` marked lower-priority goals.
- Work was split into two-to-three-day checklist items, implemented on feature
  branches, and moved to review with relevant links and context on the card.
- GitHub branches, pull requests, and commit history carried code integration
  and review.
- Trello card descriptions and activity comments preserved asynchronous
  technical decisions. The exact voice/chat channel and meeting cadence were
  handled outside the repository and are therefore not asserted here.

## Modules

This table claims only modules that the current source can demonstrate. Module
acceptance and scoring remain the evaluator's decision.

| Module | Level | Points | Justification and implementation | Contributors |
| --- | --- | ---: | --- | --- |
| Use a frontend and backend framework | Major | 2 | Vue 3 frontend and Express 5 backend, both in TypeScript | `wchoe`, `yeonjuki`, `injo`, `Saususge`, `Sean Kim` |
| Realtime features with WebSockets | Major | 2 | Authenticated WSS protocol, presence, and member-join events | `seankim96` |
| Use an ORM | Minor | 1 | Prisma schema, relations, transactions, and migrations over PostgreSQL | `injo`, `Saususge`, `KHR416` |
| OAuth 2.0 authentication | Minor | 1 | Google Authorization Code flow with state, nonce, ID-token verification, and account linking policy | `Sean Kim` |
| Organization system | Major | 2 | Isolated workspaces, memberships, roles, invitations, and board resources | `Saususge`, `injo`, `KHR416`, `seankim96` |
| **Currently defensible total** |  | **8** | Does not count incomplete planned modules |  |

The planning document also considered chat/user interaction, full profile
management, advanced permission administration, realtime collaboration,
analytics, advanced search, file upload, and a public API. They are not claimed
because the current prototype does not implement their complete subject
requirements.

## Individual contributions and challenges

### ynam — Product Owner

- Established the initial environment, repository identity, and product scope.
- Kept the product centered on a Trello-like workflow.
- Challenge: balancing a broad module plan with a deliverable prototype.
  Resolution: prioritized the workspace and board flow as the product core.

### chakim — Project Manager

- Defined the Trello workflow, ownership labels, blocker handling, and
  invitation workstream in the project plan.
- Coordinated workspace/member management requirements.
- Challenge: invitations span authorization, email, and account lifecycle.
  Resolution: used signed, expiring, email-bound links with a queued SMTP send.

### yeonjuki — Tech Lead

- Structured backend modules and contributed card-domain foundations.
- Implemented the HTTPS Nginx reverse proxy and local certificate workflow
  under the repository aliases `yeonjunky`/`yeonjunkim`.
- Challenge: serving frontend, REST, OAuth callback, and WSS from one origin.
  Resolution: routed them through a single Nginx TLS entrypoint.

### injo — Developer

- Created the initial Prisma schema and migrations.
- Implemented list/card persistence and integrated API-backed drag-and-drop.
- Challenge: stable ordering without rewriting every sibling.
  Resolution: used fractional sequence values and transactional checks.

### wchoe — Developer

- Built and reorganized the Vue UI, routes, shared components, and API client.
- Removed initial mock dependencies and hardened board/API error paths under
  the `KHR416` and `wchoe` aliases.
- Challenge: keeping role-dependent controls consistent with backend rules.
  Resolution: centralized authenticated requests and rendered write actions
  only for roles that can perform them.

### Integration history

Later authentication, realtime, and prototype-completion commits appear as
`Sean Kim`/`seankim96`, with automation co-author records on selected changes.
Because the repository does not prove how this alias maps to the planning
logins, this work is kept explicit instead of being silently attributed to a
team member.

## Resources

Primary references used while designing and implementing the project:

- [Vue documentation](https://vuejs.org/guide/introduction.html)
- [Vue Router documentation](https://router.vuejs.org/)
- [Express documentation](https://expressjs.com/)
- [Prisma documentation](https://www.prisma.io/docs)
- [PostgreSQL documentation](https://www.postgresql.org/docs/15/)
- [Redis documentation](https://redis.io/docs/latest/)
- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [RFC 6455: The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Nodemailer documentation](https://nodemailer.com/)
- [Docker Compose documentation](https://docs.docker.com/compose/)

### AI usage

AI assistance was used for bounded engineering support, including:

- auditing the existing repository before selecting implementation scope;
- drafting and reviewing the extensible WebSocket lifecycle and event routing;
- identifying authentication, permission, privacy, and shutdown edge cases;
- proposing focused refactors that remove mock data without changing the
  prototype's intended behavior;
- drafting unit/integration test cases and reconciling DTO documentation with
  implementation;
- organizing this README from source code, tests, migrations, Git history, and
  the team planning document.

Humans remained responsible for product scope and final decisions. Suggested
changes were reviewed as diffs and accepted only after type checks, automated
tests, and production builds. No user secrets or `.env` contents were supplied
to an AI system.

## Prototype limitations

- Workspace chat has one default room and no editing, deletion, read receipts,
  typing indicator, attachment, or additional-room lifecycle. Direct messages
  remain outside the current scope.
- Workspace change events are best-effort invalidation hints rather than a
  durable event stream; reconnect performs a canonical REST snapshot refresh.
- Notifications are session-local member-join events; they have no persistent
  history or read-state backend.
- Presence is designed for a single backend instance, not cross-replica fanout.
- Friend requests support accept, reject, and cancel, but have no persistent
  history, blocking, or realtime request-delivery event.
- Search is client-side text matching without filters, ranking, or pagination.
- Attachment APIs store URL metadata; there is no binary upload service.
- Card comments, labels, and assignments have backend support but are not a
  complete frontend feature.
- Public workspaces are visible to authenticated users, not anonymous visitors.
- Swagger currently documents authentication and account endpoints, not the
  entire application API.

## Additional documentation

- [Authentication and account API](docs/auth-api.md)
- [Realtime protocol and extension points](docs/realtime.md)
- [Workspace synchronization, chat, and team presence](docs/workspace-realtime.md)
- [Friend API and presence events](docs/friends.md)
- [Workspace DTO contract](docs/workspaces.dto.ts)
- [Email invitation pipeline](docs/mail.md)
- [Design decisions and tradeoffs](docs/CONSIDERATIONS.md)
