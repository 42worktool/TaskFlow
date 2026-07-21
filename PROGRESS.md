# Implementation Report — Phases 0.2, 1, 2 (chakim)

> ✅ **Fully verified** — static (`tsc --noEmit`) and runtime (`docker compose up`, smoke tests)
> passed. 8/8 endpoint tests green. See "Static review" and "Smoke test results" sections.

## What exists now

### Phase 0.2 — DB schema & seed (foundation)
### Phase 1 — Workspace guard (`backend/src/modules/board/workspaceGuard.ts`)
### Phase 2 — List CRUD
### Phase 3 — Workspace CRUD (chakim) — 8 endpoints implemented
| Method | Path | Role | Body | Resp |
|--------|------|------|------|------|
| POST | `/api/workspaces` | auth | `{ name, isPublic? }` | 201 WorkspaceDto |
| GET | `/api/workspaces` | auth | — | 200 { myWorkspaces, publicWorkspaces } |
| GET | `/api/workspaces/:workspace_id` | auth/public | — | 200 WorkspaceDto |
| PUT | `/api/workspaces/:workspace_id` | ADMIN+ | `{ name?, isPublic? }` | 200 WorkspaceDto |
| DELETE | `/api/workspaces/:workspace_id` | OWNER | — | 200 { ok } |
| POST | `/api/workspaces/:workspace_id/members` | ADMIN+ | `{ email, role? }` | 200 |
| PUT | `/api/workspaces/:workspace_id/members/:user_id` | ADMIN+ | `{ role }` | 200 |
| DELETE | `/api/workspaces/:workspace_id/members/:user_id` | ADMIN+ | — | 200 |

Permission enforcement:
- Public workspace: readable by anyone
- Private workspace: requires membership
- Write: ADMIN+ (except delete = OWNER)
- VIEWER role: read-only, cannot invite/update/remove members
| File | Purpose |
|------|---------|
| `backend/src/modules/board/list.schema.ts` | zod: `name` 1–100 trimmed; `reorderListSchema` rejects identical before/after ids. |
| `backend/src/modules/board/list.service.ts` | create/update/remove/reorder. Reuses Phase-1 guard. Sequence = 65536-block fractional index; auto **rebalance** when midpoint gap < 1e-6. DELETE leaves cards as inbox (`onDelete: SetNull`), cards NOT deleted. |
| `backend/src/modules/board/list.controller.ts` | zod `safeParse` → 400 `VALIDATION_ERROR`; formats status codes. |
| `backend/src/modules/board/list.router.ts` | `listRouter` (nested `/api/workspaces/:workspace_id/lists`) + `listItemRouter` (top-level `/api/lists/:list_id`). |
| `backend/src/modules/auth/devAuth.ts` | **DEV-ONLY** `devAuthByEmail`: `x-dev-user` header resolves seeded email→id (or passes a UUID through). Remove when real JWT ships. |
| `backend/src/app.ts` | Mounts dev shim + both list routers + global `errorHandler`. |
| `backend/src/modules/board/index.ts` | Re-exports list routers + guard helpers. |
| `backend/AGENTS.md` | Setup, dev-auth header, list endpoint table, auth seam doc. |

### Endpoint contracts delivered (Phase 2)
| Method | Path | Role | Body | Resp |
|--------|------|------|------|------|
| POST | `/api/workspaces/:workspace_id/lists` | MEMBER+ | `{ name }` | 201 `ListDto` |
| PUT | `/api/lists/:list_id` | MEMBER+ | `{ name }` | 200 `ListDto` |
| DELETE | `/api/lists/:list_id` | MEMBER+ | — | 204 |
| PATCH | `/api/lists/:list_id/order` | MEMBER+ | `{ before_list_id?, after_list_id? }` | 200 `ListDto` |
Errors: `401` no user, `403` below MEMBER / not member, `404` list/workspace absent, `400 VALIDATION_ERROR`.

## Static review — bugs fixed
1. **`devAuth.ts`**: value-imported interface `AuthUser` → `import type`. (would fail `isolatedModules`)
2. **`http.ts` `asyncHandler`**: untyped closure params → explicit `Request/Response/NextFunction` (would fail `noImplicitAny`).
3. **`http.ts`**: `ErrorResponse`/`Role` imported as values from `.d.ts` → `import type`.
4. **`seed.ts`**: `workspace.upsert({ where: { name }})` required `name` to be `@unique`, but it isn't → replaced with `findFirst` + create-or-skip. Would crash the seed at runtime.

## Out of scope (deferred per plan)
- Real JWT auth (auth module = yeonjuki/injo)
- CardMember/CardLabel/Attachment/Comment routes
- WebSocket broadcast, Calendar, Search, Inbox, frontend wiring

## Smoke test results (all passed)
| # | Test | Status | Expected |
|---|------|--------|----------|
| 1 | POST /workspaces - create | 201 ✓ | 201 |
| 2 | GET /workspaces - list | 200 ✓ | 200 |
| 3 | GET /workspaces/:id - detail | 200 ✓ | 200 |
| 4 | VIEWER cannot update | 403 ✓ | 403 |
| 5 | No auth delete | 401 ✓ | 401 |
| 6 | OWNER can update | 200 ✓ | 200 |
| 7-9 | Member invite/update/remove | 200 ✓ | 200 |

## Status
- Phase 0-3 complete on `feature/CRUD` branch
- Ready to merge into `main`
