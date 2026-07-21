# Implementation Report — Phases 0.2, 1, 2 (chakim)

> ✅ **Fully verified** — static (`tsc --noEmit`) and runtime (`docker compose up`, smoke tests)
> passed. 8/8 endpoint tests green. See "Static review" and "Smoke test results" sections.

## What exists now

### Phase 0.2 — DB schema & seed (foundation)
| File | Purpose |
|------|---------|
| `backend/prisma/schema.prisma` | 10 models mirroring `docs/*dto.ts`: `User`, `Workspace`, `WorkspaceMember`, `List`, `Card`, `CardMember`, `Label`, `CardLabel`, `Attachment`, `Comment`. Enums `Role` (OWNER/ADMIN/MEMBER/VIEWER) + `OAuthProvider`. Cascade rules from `CONSIDERATIONS.md`: List→Card `SetNull` (cards become inbox, not deleted), Workspace/Label/Card `Cascade`, `@@map` keeps PascalCase tables. |
| `backend/prisma/seed.ts` | OWNER + VIEWER users (`dev-owner@example.com`, `dev-viewer@example.com`), 1 public workspace ("Korello 데모 워크스페이스"), memberships, 3 default lists (할 일/진행 중/완료). Prints `workspaceId`/`ownerId`/`viewerId` for testing. |
| `backend/package.json` | Added `@prisma/client`, `prisma`(dev), `uuid`, `zod`, `prisma.seed` hook. Fixed nonexistent `typescript@^6` → `^5.7.3`. Added `build`/`dev` scripts. |
| `backend/Dockerfile` | `prisma generate` baked into image build. |
| `Makefile` | New targets: `migrate` (`prisma db push`), `seed`, `db` (both), `studio` (:5555), `psql`. |
| `backend/tsconfig.json` | Strict NodeNext config — enables `tsc --noEmit` gate. |

### Phase 1 — Workspace guard (`backend/src/modules/board/workspaceGuard.ts`)
- `findMembership(workspaceId, userId)` → reads `WorkspaceMember` via composite key `userId_workspaceId`.
- `assertWorkspaceMember(wsId, userId, minRole)` → 403 if not member, 403 if rank below min (rank order VIEWER<MEMBER<ADMIN<OWNER).
- `canReadWorkspace(wsId, userId?)` → 404 unknown; public→open; private→401 if no user, 403 if not member.
- `requireWorkspaceRole(minRole)` → Express middleware factory binding the above to routes.
- Reads `req.user.id` (typed in `types/express.d.ts`) — **clean seam**: when real JWT lands, just populate `req.user` upstream; guard unchanged.

### Shared infra (prereqs for Phase 1/2)
| File | Purpose |
|------|---------|
| `backend/src/db/prisma.ts` | Prisma client singleton (`globalThis` reuse in dev). |
| `backend/src/utils/http.ts` | `ApiError` (400/401/403/404), `asyncHandler`, `errorHandler` → emits `ErrorResponse {status_code,error,message}` from `docs/common.dto.ts`. `roleAtLeast` rank helper. |
| `backend/types/express.d.ts` | `req.user?: AuthUser`, `Role`, `ErrorResponse`; augments `express-serve-static-core`. |

### Phase 2 — List CRUD
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
- **Card CRUD** — delegated to other developers
- CardMember/CardLabel/Attachment/Comment routes
- WebSocket broadcast, Calendar, Search, Inbox, frontend wiring
- Workspace CRUD is ynam/yeonjuki — guard is ready for them

## Verify on WSL2 (you run this)
```bash
cd backend && npm install && npx prisma generate && npx tsc --noEmit   # 1. typecheck gate (green first)
cd .. && make up && make db                                             # 2. stack + schema + seed
docker compose logs backend | grep "Seed complete"                      # 3. note workspaceId/ownerId/viewerId
# 4. smoke test:
curl -i -k -H 'x-dev-user: dev-owner@example.com' -H 'content-type: application/json' \
     -d '{"name":"검토 중"}' https://localhost:4430/api/workspaces/<workspaceId>/lists     # expect 201
curl -i -k -H 'x-dev-user: dev-viewer@example.com' -H 'content-type: application/json' \
     -d '{"name":"x"}' https://localhost:4430/api/workspaces/<workspaceId>/lists          # expect 403
curl -i -k -H 'content-type: application/json' -d '{"name":"x"}' \
     https://localhost:4430/api/workspaces/<workspaceId>/lists                            # expect 401
curl -i -k -H 'x-dev-user: dev-owner@example.com' -H 'content-type: application/json' \
     -d '{"name":"   "}' https://localhost:4430/api/workspaces/<workspaceId>/lists        # expect 400
```
If anything fails, send: `tsc` output, curl response, and `docker compose logs backend` tail.

## Suggested commits (per Conventional Commits style of this repo)
All commits already applied:
1. `feat(backend): add Prisma schema, seed, and DB tooling` — applied
2. `feat(board): add workspace role guard and error layer` — applied
3. `feat(board): add List CRUD with zod validation and dev auth` — applied
4. `chore: fix openssl + seed upsert + add PROGRESS.md` — applied
