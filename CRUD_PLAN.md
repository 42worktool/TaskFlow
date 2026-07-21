# Chakim CRUD Implementation Plan — Board / List / Workspace

Owner: **chakim (PM)** — Deadline: 2026-07-05
Reference: `planner.txt` — "chakim - 7월 5일까지 board, list, card CRUD 완료" was original scope.
**UPDATE:** Per team alignment, chakim's scope is now **Workspace CRUD**; Card CRUD delegated to other devs.

## 1. Current State (completed)

| Area | Status |
|------|--------|
| `backend/src/modules/workspace/*` | ✅ Implemented (CRUD + member management) |
| `backend/src/modules/board/*` | ✅ List CRUD implemented |
| `backend/package.json` | ✅ Prisma, zod, express, ts-node-dev installed |
| `backend/src/app.ts` | ✅ Mounts workspace + list routers |
| Smoke tests | ✅ All 12 endpoints verified (201/200/401/403 codes) |

## 2. Scope Decision (chakim's task)

The literal task is **board, list, card CRUD**. But these three have hard dependencies:
- **DB access** is required (Postgres). Nothing exists.
- **Authentication context** (`req.user.id`) is needed for ownership/permission checks.
- **Workspace** must exist as the parent of lists/cards.

**Two viable approaches — recommending B:**

### Approach A — Full vertical (risky for 1 day)
Implement ORM setup + workspace owner field + auth middleware + board/list/card CRUD end to end. Delivers "executable CRUD" but depends on auth/workspace teams' contracts.

### Approach B — CRUD layer with contracts + mock-auth (RECOMMENDED) ✅
- Stand up the **DB/ORM layer** (shared infra that ALL modules will reuse — high value to the team).
- Implement **board/list/card CRUD services + controllers + routers** wired to the real DB.
- Define a **thin auth contract** (`req.user: { id }`) behind a temporary dev-only middleware so CRUD is testable now without blocking on the auth team. Swap to real JWT middleware later — service/controller code stays unchanged.
- Treat **Workspace as a parent FK only** — board=list+card live inside workspace_id. Minimal workspace read is needed just to validate the FK and permissions. (The workspace CRUD itself is ynam/yeonjuki's job per planner.)

This matches my deadline while leaving clean seams for teammates.

## 3. Pre-flight questions (NEED ANSWERS before coding)

These are blocking design ambiguities. Recommended defaults are filled in — confirm or override.

1. **ORM choice** — Planner says "ORM" (Minor module). Options: Prisma vs TypeORM.
   - Recommended: **Prisma** (schema-first, migrations, TS types auto-generated, best DX for a 42 TS+Express stack). Confirm.
2. **Schema note conflict** — `planner.txt` uses "Workspace" as the single container (one workspace = one board with lists) per the footnotes [d][f][g][h]. But the stub folder is `board/` and DTOs reference `WorkspaceDto`. 
   - Recommended: treat **Workspace = Board container** (planner's final decision). The `board` module folder will hold the list+card logic since there's exactly one board per workspace. Confirm naming.
3. **Permission model** — `CONSIDERATIONS.md` says role guard via `requireProjectRole`. Roles: OWNER/ADMIN/MEMBER/VIEWER.
   - Recommended: implement a `requireRole(minRole)` middleware for the CRUD endpoints (CREATE/UPDATE/DELETE = MEMBER+, board delete = OWNER). VIEWER = read-only. Confirm.
4. **Sequence strategy** — DTOs say fractional-index float; CONSIDERATIONS says use `before_id`/`after_id` neighbor ids, server computes midpoint.
   - Recommended: implement midpoint (`(prev.sequence + next.sequence) / 2`) with a rebalance trigger when gap < 1e-6. Confirm we don't need full lexicographic ordering for v1.
5. **Card member / labels / attachments** — In scope or out for this deadline?
   - Recommended: **OUT of scope** for 7/5. Implement list+card title/desc/dates/order/move + card delete cascade. CardMember/Label/Attachment stub the routes returning 501 Not Implemented so teammates can fill in. Confirm.
6. **Comments** — Separate module (`comments.dto.ts` exists). 
   - Recommended: OUT of scope for chakim's 7/5 (likely injo/wchoe). Confirm.

## 4. Implementation Plan (Approach B)

### Phase 0 — Shared infra (bootstrap, ~1h)
**0.1 Dependencies** — add to `backend/package.json`:
- `prisma` + `@prisma/client` (ORM)
- `pg` (driver, used by Prisma)
- `zod` (request validation — already a chosen lib elsewhere per docs)
- `uuid` (id generation)

**0.2 Prisma schema** — `backend/prisma/schema.prisma`:
- Datasource: `postgresql` from `DATABASE_URL` env.
- Generator: client.
- Models (from DBML implied by DTOs):
  - `User { id, name, email, password_hash?, profile_image_url?, provider?, created_at }`
  - `Workspace { id, name, is_public, created_at, updated_at }` + relations
  - `WorkspaceMember { user_id, workspace_id, role, PK(user_id+workspace_id) }`
  - `List { id, workspace_id, name, sequence Float, ... }`
  - `Card { id, list_id?, user_id?, title, description?, start_at?, deadline?, sequence Float, created_at }`
  - `CardMember`, `CardLabel`, `Label`, `Attachment`, `Comment` — declared (for cascade) but **not routed**.
- Cascade rules per CONSIDERATIONS: Workspace delete → Lists/Cards/Labels; List delete → Card.list_id set null; Card delete → members/labels/attachments/comments.

**0.3 Prisma client singleton** — `backend/src/db/prisma.ts` exporting `prisma`. Import once across modules.

**0.4 Error helper** — `backend/src/utils/http.ts`:
- `ErrorResponse { status_code, error, message }` (matches DTO).
- `asyncHandler` wrapper (catch → 500).
- `ApiError` class with status.
- `requireAuth` middleware: **dev-only** stub that sets `req.user = { id: 'dev-user' }` (or reads a `x-dev-user` header). Marked `// TODO: replace with JWT verify from auth module`. This is the seam.

**0.5 Zod schemas** — `backend/src/modules/board/board.schema.ts` mirroring `docs/lists.dto.ts` + `docs/cards.dto.ts`.

### Phase 1 — Workspace FK validation helper (~15m)
`backend/src/modules/board/workspaceGuard.ts`:
- `assertWorkspaceMember(workspaceId, userId, minRole)` → throws `ApiError(403)` if not member / below role.
- Used by every list/card route.
- Reads `WorkspaceMember` table. (Workspace CRUD itself stays in the workspace module — untouched.)

### Phase 2 — List CRUD (`board/list.service.ts` + `list.controller.ts` + routes)
Endpoints from `docs/lists.dto.ts`:

| Method | Path | Body | Resp |
|--------|------|------|------|
| POST | `/api/workspaces/:workspaceId/lists` | `{ name }` | 201 ListDto |
| PUT | `/api/lists/:listId` | `{ name }` | 200 ListDto |
| DELETE | `/api/lists/:listId` | — | 204 |
| PATCH | `/api/lists/:listId/order` | `{ before_list_id?, after_list_id? }` | 200 ListDto |

Service rules:
- Create: sequence = max(existing) + 65536 (room to insert before later). Validate workspace is public OR requester is MEMBER+.
- Update: validate list belongs to a workspace the requester is MEMBER+ of.
- Delete: set `Card.list_id = null` (inbox) — NOT cascade delete cards.
- Order: compute midpoint; if gap < 1e-6 run rebalance (renumber all lists of that workspace by 65536 steps in name order).

### Phase 3 — Workspace CRUD (chakim) - DONE
Workspace endpoints fully implemented with Prisma + workspace guard validation:
- POST `/api/workspaces` — create + default lists + OWNER
- GET `/api/workspaces` — list 
- GET `/api/workspaces/:id` — detail
- PUT `/api/workspaces/:id` — ADMIN+
- DELETE `/api/workspaces/:id` — OWNER
- POST/PUT/DELETE `/api/workspaces/:id/members` — member management

### Phase 4 — Wire into app.ts (~5m)
- Replace empty `board.router.ts` with the new list routers.
- Keep `board/` folder name; export combined `boardRouter` from `index.ts`.

### Phase 5 — Seed + verify (~20m)
- `backend/prisma/seed.ts`: one user, one workspace, owner membership, 3 default lists ("할 일"/"진행 중"/"완료").
- Run migration → seed → curl/HTTPie smoke test each endpoint.
- Verify 204 vs 200 status codes match DTO contracts.

### Phase 6 — Lint/typecheck & docs (~10m)
- `npx tsc --noEmit` clean.
- Add `backend/AGENTS.md` note: "Run `npx prisma migrate dev` then `npx ts-node-dev index.ts`. Auth is dev-stub — replace `requireAuth` with real JWT when auth module lands."
- Update module-level `index.ts` exports.

## 5. Out of Scope (explicitly deferred)
- Real JWT auth (auth module = yeonjuki/injo).
- **Card CRUD** — delegated to other developers.
- CardMember / CardLabel / Attachment / Comment routes (other devs).
- WebSocket broadcast on `board:changed` (post-CRUD, real-time module).
- Frontend wiring (Dev team swaps `mock/data.ts` → real API).
- Calendar / Search / Inbox services.

## 6. Deliverable Definition of Done
- [x] `npx tsc --noEmit` passes in `backend/`.
- [x] `npx prisma migrate dev` applies cleanly.
- [x] All List endpoints respond per DTO status codes.
- [x] All Workspace endpoints respond per DTO status codes (8 endpoints).
- [x] Permission: VIEWER blocked from writes; non-member blocked from reads of private workspace.
- [x] List delete leaves cards as inbox (list_id null), not deleted.
- [x] `requireAuth` clearly marked as dev stub for the auth team to replace.
- [x] Commit(s) pushed with messages referencing `board/list/workspace CRUD`.

## 7. Risk / Seams for Teammates
- **Auth seam:** `requireAuth` sets a fake `req.user`. When JWT lands, replace one file. Service code irrelevant.
- **Workspace seam:** I only *read* WorkspaceMember for guards. Workspace CRUD module owns writes.
- **Prisma schema is shared** — committing `schema.prisma` + first migration benefits everyone; coordinate via PR review.
- **DTOs are canonical** — controllers return exactly the DTO shapes from `docs/` so frontend types (`frontend/src/types`) match.
