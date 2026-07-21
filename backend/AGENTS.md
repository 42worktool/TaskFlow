# Backend — DB & dev setup

## One-time
```bash
cd backend
npm install                 # installs @prisma/client, prisma, uuid, etc.
npx prisma generate         # build the PrismaClient types (after schema.prisma edits)
npx tsc --noEmit            # typecheck gate — must be green before pushing
```

## Database (dev)
Postgres runs in docker-compose as `app_postgres` (`user/password/mydb`). `DATABASE_URL` is already set in `docker-compose.yml`.

From the project root with the stack running (`make up`):
```bash
make db        # prisma db push  +  prisma db seed   (idempotent-ish on dev data)
make psql      # raw shell
make studio    # Prisma Studio on :5555
```

Or manually inside the container:
```bash
docker compose exec backend npx prisma db push
docker compose exec backend npx prisma db seed
```

> We use `prisma db push` (not `migrate dev`) for dev-speed iteration. When the schema
> stabilises, switch to `prisma migrate dev --name init` to commit a real migration.

## Seed contents (`prisma/seed.ts`)
- 2 users: `dev-owner@example.com` (role OWNER), `dev-viewer@example.com` (role VIEWER)
- 1 public workspace: "Korello 데모 워크스페이스"
- OWNER + VIEWER memberships
- 3 default lists: 할 일 / 진행 중 / 완료

Use the printed `workspaceId` / `ownerId` / `viewerId` from seed output to test the
`workspaceGuard` (Phase 1): OWNER can write, VIEWER is blocked with 403.

## Auth seam (IMPORTANT for the auth team)
`src/utils/http.ts` defines `ApiError` + `errorHandler`. Endpoints throw `ApiError`;
the global `errorHandler` in `src/app.ts` converts to `ErrorResponse`:
`{ status_code, error, message }` from `docs/common.dto.ts`.

There is **no real auth middleware yet**. `requireWorkspaceRole()` in
`src/modules/board/workspaceGuard.ts` reads `req.user.id` and throws `401` if absent.
When the JWT middleware from the `auth` module lands, just ensure it populates
`req.user = { id, role? }` (typed in `backend/types/express.d.ts`) and call it before
the protected routers. No changes to the guard or services.

## Where things live
- `prisma/schema.prisma`  — canonical DB model (mirrors `docs/*.dto.ts`)
- `src/db/prisma.ts`      — singleton client
- `src/utils/http.ts`    — errors + asyncHandler + role helpers
- `src/modules/board/workspaceGuard.ts` — role/membership checks (Phase 1)
- `src/modules/board/list.{schema,service,controller,router}.ts` — List CRUD (Phase 2)
- `src/modules/auth/devAuth.ts` — dev-only auth shim (email-or-uuid header)
- `types/express.d.ts`    — `req.user`, `Role`, `ErrorResponse`

## Dev auth header (devAuthByEmail)
During dev, set `x-dev-user` to either a seeded user email (e.g.
`dev-owner@example.com`) or a raw UUID. The middleware resolves email->id
against the DB. Remove `devAuthByEmail` from `src/app.ts` when the real
JWT middleware ships.

## List endpoints (Phase 2)
| Method | Path | Role | Body |
|--------|------|------|------|
| POST | `/api/workspaces/:workspace_id/lists` | MEMBER+ | `{ name }` |
| PUT | `/api/lists/:list_id` | MEMBER+ | `{ name }` |
| DELETE | `/api/lists/:list_id` | MEMBER+ | — (204) |
| PATCH | `/api/lists/:list_id/order` | MEMBER+ | `{ before_list_id?, after_list_id? }` |

- Sequence uses 65536-block fractional indexing; auto-rebalance when gap < 1e-6.
- DELETE leaves cards as inbox (`list_id` SET NULL), cards are NOT deleted.
- Errors: 401 no user, 403 below MEMBER, 404 list/workspace absent, 400 validation.
