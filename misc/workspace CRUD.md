# Workspace CRUD Implementation Guide

> Historical planning note. The current implementation and HTTP shapes are
> documented in `backend/src/modules/workspace`, `docs/workspaces.dto.ts`, and
> the root `README.md`.

> Owner: chakim (PM)
> Scope: **Workspace CRUD only** (member invite/role, board, list, card are excluded)
> Reference: `Planner.md` (API spec lines 820-848, common models 1046-1087, common responses 1037-1043)

---

## 0. Current State Summary

Existing groundwork:
- `backend/prisma/schema.prisma` — `Workspace`, `WorkspaceMember`, `User` models defined, migration applied (`20260707014804_init/migration.sql`)
- `backend/src/modules/workspace/` — folder structure only: `router.ts` (empty Router), `controller.ts` (empty), `service.ts` (empty), `index.ts` (re-export)
- `backend/src/app.ts:4,15` — `/api/workspaces` path mounts `workspaceRouter`
- `backend/prisma/seed.ts` — one dev workspace seed exists (but `src/config` is missing, so it can't run -> created as part of this work)
- `frontend/src/pages/Workspace.vue` — uses mock data (`myWorkspaces`)
- `frontend/src/types/index.ts` — `Workspace`, `WorkspaceMember`, `Role` types defined
- `frontend/src/router/index.ts:17` — `/workspaces` route exists

**Note (data model gap):** Planner.md discussed merging workspace + single board (footnotes b-h), but `schema.prisma` kept the traditional structure where **List is under Workspace**. This document is written against schema.prisma (the implementation source of truth).

---

## 1. Prerequisites (Prisma client + auth dependency)

> Workspace CRUD requires an "authenticated user." The auth module is still empty, so this step creates **only the minimum needed for this scope**. (Full auth is a separate owner.)

### 1.1 Create `backend/src/config.ts` (seed/dev user ID)

`backend/prisma/seed.ts:7` imports `DEV_USER_ID`, so the missing file must be created.

```ts
// backend/src/config.ts
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001'
export const PORT = Number(process.env.PORT ?? 3000)
export const IS_DEV = process.env.NODE_ENV !== 'production'
```

### 1.2 Create Prisma client singleton

`backend/src/db.ts` (new):

```ts
// backend/src/db.ts
import { PrismaClient } from '@prisma/client'
export const prisma = new PrismaClient()
```

### 1.3 Packages + build/seed scripts

```bash
cd backend
npm install @prisma/client
npm install -D prisma zod ts-node typescript @types/node
```

> `package.json` currently only has `express`; prisma is not listed (`backend/package.json:12-14`). Since `schema.prisma`/`seed.ts` exist, the dependency must be added.
> **Important:** `package.json:scripts` currently has only a `test` stub, so `npm run db:seed` / `tsc --noEmit` referenced by this guide won't work. You must add the scripts below.

```json
// backend/package.json — augmented scripts
{
  "dev": "ts-node-dev --respawn --transpile-only index.ts",
  "build": "tsc -p .",
  "typecheck": "tsc --noEmit -p .",
  "migrate": "prisma migrate deploy",
  "db:seed": "ts-node prisma/seed.ts",
  "db:reset": "prisma migrate reset --force && npm run db:seed"
}
```

### 1.3.1 Create `backend/tsconfig.json` (required)

`backend/` currently has no `tsconfig.json` (none found). Type-check steps like `tsc --noEmit` / `npm run build` / `vue-tsc` all fail, so it must be created before starting this work. Use this minimal config so the `@prisma/client` types produced by `prisma generate` and `types/express.d.ts` (section 1.4) are recognized:

```json
// backend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node", "express"],
    "typeRoots": ["./node_modules/@types", "./src/types"]
  },
  "include": ["src", "prisma/seed.ts"]
}
```

### 1.4 Dev auth middleware (temporary)

Used to verify behavior until the auth owner finishes. **The auth owner replaces this once the real implementation lands.** An `IS_DEV` guard forcibly blocks it from leaking into a production build.

```ts
// backend/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express'
import { DEV_USER_ID, IS_DEV } from '../config'

// Dev only: every request is treated as DEV_USER. Must not load in production.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  // IS_DEV guard: if this middleware is loaded in production (NODE_ENV=production) it throws.
  // Turned into an enforced contract (not just a warning in section 10.3) to prevent accidental deployment.
  if (!IS_DEV) throw new Error('dev requireAuth must not be loaded outside development')
  req.user = { id: DEV_USER_ID }
  next()
}
```

> The `.user` type augmentation on `express.Request` is declared in `backend/src/types/express.d.ts`:

```ts
// backend/src/types/express.d.ts
import 'express'
declare module 'express' {
  interface Request {
    user?: { id: string }
  }
}
```

---

## 2. Backend: Workspace Service

Implement `backend/src/modules/workspace/workspace.service.ts`. **Direct Prisma calls, with validation logic.**

### 2.1 Function list (implementation order)

| Function | Description | Auth baseline |
|---|---|---|
| `listWorkspaces(userId)` | Workspaces I belong to + public workspaces | authenticated |
| `getWorkspace(userId, wsId)` | Single detail (member or public) | authenticated |
| `createWorkspace(userId, dto)` | Create + register creator as OWNER membership | authenticated |
| `updateWorkspace(userId, wsId, dto)` | Partial update of name/is_public | ADMIN+ |
| `deleteWorkspace(userId, wsId)` | Delete (cascade) | OWNER only |

### 2.2 Key implementation notes

- **Create transaction**: use `prisma.$transaction` to run `workspace.create` + `workspaceMember.create(role: OWNER)` together. Planner.md 348-357 "one board auto-created" is excluded from this scope (workspace CRUD only) — the board owner adds it.
- **List split**: call `prisma.workspace.findMany` twice
  - `my`: `members: { some: { user_id: userId } }`
  - `public`: `is_public: true, members: { none: { user_id: userId } }` (dedupe)
- **Get authorization**: membership exists OR `is_public` true. Otherwise 403.
- **Update/delete authorization**: fetch membership first -> check role. None -> 403.
- **Role priority**: OWNER > ADMIN > MEMBER > VIEWER. Update requires ADMIN+, delete requires OWNER only.
- **Error throwing**: service throws `Error` subclasses (`NotFoundError`, `ForbiddenError`); controller maps to HTTP status.

```ts
// service skeleton (implement this directly when writing the real file)
import { prisma } from '../../db'
import type { Prisma } from '@prisma/client'

export class ForbiddenError extends Error { code = 'FORBIDDEN' as const }
export class NotFoundError extends Error { code = 'NOT_FOUND' as const }

async function getRole(wsId: string, userId: string) {
  const m = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: wsId, user_id: userId } },
  })
  return m?.role ?? null
}

const ROLE_RANK = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 } as const

export async function createWorkspace(userId: string, name: string, isPublic: boolean) {
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name,
        is_public: isPublic,
        members: { create: { user_id: userId, role: 'OWNER' } },
      },
      include: { members: { include: { user: true } } },
    })
    return ws
  })
}
// listWorkspaces / getWorkspace / updateWorkspace / deleteWorkspace follow the same pattern
```

---

## 3. Backend: Workspace Controller

`backend/src/modules/workspace/workspace.controller.ts`. **HTTP layer only**: input validation (zod recommended), call service, map response.

### 3.1 Input validation (zod)

```bash
npm install zod
```

```ts
// backend/src/modules/workspace/workspace.controller.ts
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  is_public: z.boolean().optional().default(false),
})
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  is_public: z.boolean().optional(),
}).refine(v => v.name !== undefined || v.is_public !== undefined, { message: 'either name or is_public is required' })
```

### 3.2 Handler mapping (handlers wired into the Router)

| HTTP | Path | Handler | Auth middleware |
|---|---|---|---|
| GET | `/` | `list` | requireAuth |
| POST | `/` | `create` | requireAuth |
| GET | `/:workspaceId` | `getOne` | requireAuth |
| PUT | `/:workspaceId` | `update` | requireAuth |
| DELETE | `/:workspaceId` | `remove` | requireAuth |

> Per Planner.md 820-848: **PUT** (not PATCH), path param `workspace_id`.

### 3.3 Common error mapping pattern

```ts
// controller common pattern
try {
  const result = await service(...)
  return res.status(200).json(result) // 201 for create
} catch (e) {
  if (e instanceof NotFoundError) return res.status(404).json({ error: 'workspace not found' })
  if (e instanceof ForbiddenError) return res.status(403).json({ error: 'forbidden' })
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
  return res.status(500).json({ error: 'server error' })
}
```

### 3.4 Response DTO (snake_case — schema.prisma convention)

```ts
// Workspace -> response DTO
{
  id: string,
  name: string,
  is_public: boolean,
  created_at: string,  // ISO
  updated_at: string,
  members: [{
    user_id: string, role: 'OWNER'|'ADMIN'|'MEMBER'|'VIEWER',
    user: { id: string, name: string, email: string, profile_image_url: string|null }
  }]
}
```

> Note: Prisma returns `isPublic` (camelCase), so the controller must convert to `is_public`, `created_at`, etc. A helper `toWorkspaceDTO()` is recommended.

Reference — `frontend/src/types/index.ts:3` has `Role = 'OWNER'|'EDITOR'|'VIEWER'|'MEMBER'`; this is mock-only and **the `Role` enum in schema.prisma (OWNER/ADMIN/MEMBER/VIEWER) is correct**. Fix the frontend types when wiring up.

---

## 4. Backend: Router

`backend/src/modules/workspace/workspace.router.ts`:

```ts
import { Router } from "express";
import * as ctrl from "./workspace.controller";
import { requireAuth } from "../../middleware/auth";

export const workspaceRouter = Router();

workspaceRouter.get("/", requireAuth, ctrl.list);
workspaceRouter.post("/", requireAuth, ctrl.create);
workspaceRouter.get("/:workspaceId", requireAuth, ctrl.getOne);
workspaceRouter.put("/:workspaceId", requireAuth, ctrl.update);
workspaceRouter.delete("/:workspaceId", requireAuth, ctrl.remove);
```

> `app.ts:15` already mounts `/api/workspaces`, so no change needed there.

---

## 5. Frontend: API client

### 5.1 Install HTTP client

```bash
cd frontend
npm install axios
```

> `package.json:12-14` has no HTTP client. fetch is also possible; axios is assumed for team convention (use fetch as fallback).

### 5.2 Create `frontend/src/api/client.ts`

```ts
import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,  // Planner.md 1034: credentials same-origin
})
```

### 5.3 Create `frontend/src/api/workspace.ts`

```ts
import { api } from './client'
import type { Workspace } from '../types'

export const WorkspaceAPI = {
  list: () => api.get<{ my: Workspace[]; public: Workspace[] }>('/workspaces').then(r => r.data),
  get: (id: string) => api.get<Workspace>(`/workspaces/${id}`).then(r => r.data),
  create: (name: string, isPublic = false) =>
    api.post<Workspace>('/workspaces', { name, is_public: isPublic }).then(r => r.data),
  update: (id: string, patch: { name?: string; is_public?: boolean }) =>
    api.put<Workspace>(`/workspaces/${id}`, patch).then(r => r.data),
  remove: (id: string) => api.delete(`/workspaces/${id}`).then(r => r.data),
}
```

> The `Workspace` interface in `frontend/src/types/index.ts` needs to be amended against the schema:
> - drop `color` (not in DB; frontend-only mock) or derive it client-side
> - `member_count` is computed from `members.length` in the API response
> - fix the `role` enum to `'OWNER'|'ADMIN'|'MEMBER'|'VIEWER'`

---

## 6. Frontend: Page wiring

### 6.1 `Workspace.vue` mock -> API

Remove `import { myWorkspaces } from '../mock/data'` at `frontend/src/pages/Workspace.vue:9` and use:

```ts
import { onMounted, ref } from 'vue'
import { WorkspaceAPI } from '../api/workspace'
import type { Workspace } from '../types'

const myWorkspaces = ref<Workspace[]>([])
const openWorkspaces = ref<Workspace[]>([])

onMounted(async () => {
  const data = await WorkspaceAPI.list()
  myWorkspaces.value = data.my
  openWorkspaces.value = data.public
})
```

### 6.2 Wire the "new project" card to a create modal

Clicking `project-card--new` at `Workspace.vue:50-56` opens a modal -> calls `WorkspaceAPI.create()` -> refreshes the list.

### 6.3 (Optional) Workspace edit/delete UI

Add an overflow menu (`...`) on the workspace card -> dropdown with "Edit"/"Delete" -> calls `update`/`remove` respectively. **For this minimal scope, create/read first; edit/delete UI can be deferred** (build the APIs but make the UI optional).

---

## 7. Verification plan (curl tests)

After running the DB migration + seed:

```bash
# Prereq: prisma generate to produce @prisma/client types (otherwise import error)
cd backend && npx prisma generate

# Migration + seed (using the npm scripts defined in section 1.3)
npm run migrate && npm run db:seed

# List
curl -s http://localhost:3000/api/workspaces | jq

# Create
curl -s -X POST http://localhost:3000/api/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test WS","is_public":false}' | jq

# Detail
curl -s http://localhost:3000/api/workspaces/00000000-0000-4000-8000-0000000000aa | jq

# Edit (OWNER required — dev middleware seeds DEV_USER as OWNER)
curl -s -X PUT http://localhost:3000/api/workspaces/<id> \
  -H 'Content-Type: application/json' \
  -d '{"name":"renamed"}' | jq

# Delete
curl -s -X DELETE http://localhost:3000/api/workspaces/<id> | jq
```

Type check (after all code is written, requires tsconfig.json from section 1.3.1):

```bash
# backend: typecheck script defined in section 1.3 (tsconfig.json required)
cd backend && npm run typecheck
# frontend
cd ../frontend && npm run build   # build script includes vue-tsc -b (package.json:8)
```

---

## 8. Checklist

- [ ] Create `backend/src/config.ts` (DEV_USER_ID, PORT, IS_DEV)
- [ ] Create `backend/tsconfig.json` (section 1.3.1) — without it typecheck/build all fail
- [ ] Augment `backend/package.json` scripts (section 1.3: dev/build/typecheck/migrate/db:seed/db:reset)
- [ ] `backend/src/db.ts` Prisma singleton
- [ ] Run `npx prisma generate` (produce @prisma/client types — skip it and imports error)
- [ ] `backend/src/middleware/auth.ts` dev requireAuth + `types/express.d.ts`
- [ ] `backend/src/modules/workspace/workspace.service.ts` (5 functions + error classes)
- [ ] `backend/src/modules/workspace/workspace.controller.ts` (zod validation + DTO conversion)
- [ ] `backend/src/modules/workspace/workspace.router.ts` (5 routes)
- [ ] `backend/package.json` — add `@prisma/client`, `prisma`, `zod`, `ts-node`
- [ ] Confirm `backend/prisma/seed.ts` runs (`npm run db:seed` passes)
- [ ] `frontend/src/api/client.ts` + `api/workspace.ts`
- [ ] `frontend/src/types/index.ts` — fix Role enum, amend Workspace
- [ ] `frontend/src/pages/Workspace.vue` — mock -> API
- [ ] Wire create modal UI
- [ ] (Optional) Edit/delete UI
- [ ] All 5 curl integration tests pass
- [ ] `npm run typecheck` (backend) + `npm run build` (frontend) with 0 type errors

---

## 9. Out of scope (explicit)

This document covers **workspace CRUD only**. The following are separate owners / separate docs:
- Member invite (`POST /workspaces/{id}/members`), role change (`PUT .../members/{uid}`), member removal (`DELETE .../members/{uid}`)
- Board auto-creation (Planner.md 357 "one board auto-created" — coordinate with board owner)
- Real JWT/session auth (auth owner)
- WebSocket realtime sync
- Redis caching

---

## 10. Risks / Caveats

1. **Prisma client not generated**: if `npx prisma generate` is not run first, `@prisma/client` import errors. (The generator is configured in `prisma/schema.prisma`.)
2. **Express 5**: `package.json:13` has `express@^5.2.1`. Express 5 matches `@types/express@5` (devDependencies OK). Verify `req.params.workspaceId` in routes (same as Express 4).
3. **Dev middleware security**: `requireAuth` hardcodes `DEV_USER_ID`. Use until auth lands, replace immediately when it does. Never include in a production build (`IS_DEV` guard recommended).
4. **DTO conversion missing**: Prisma returns camelCase by default (`isPublic`, `createdAt`). Responses must be snake_case (schema.prisma comments lines 4-7). Missing it breaks the frontend.
5. **401 vs 403**: once the middleware passes, `user.id` is always set (dev). When real auth is wired, split unauthenticated=401 from insufficient-permission=403.
