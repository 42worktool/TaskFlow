# Workspace CRUD 구현 가이드

> 담당: chakim (PM)
> 범위: **워크스페이스 CRUD만 구현** (멤버 초대/권한/보드/리스트/카드는 제외)
> 기준 문서: `Planner.md` (API 명세 820~848줄, 공통 모델 1046~1087줄, 공통 응답 1037~1043줄)

---

## 0. 현재 상태 요약

이미 갖춰진 기반:
- `backend/prisma/schema.prisma` — `Workspace`, `WorkspaceMember`, `User` 모델 정의 완료, 마이그레이션 적용됨 (`20260707014804_init/migration.sql`)
- `backend/src/modules/workspace/` — `router.ts`(빈 Router), `controller.ts`(빈 파일), `service.ts`(빈 파일), `index.ts`(re-export) 폴더 구조만 있음
- `backend/src/app.ts:4,15` — `/api/workspaces` 경로에 `workspaceRouter` 마운트됨
- `backend/prisma/seed.ts` — 개발용 워크스페이스 1개 시드 데이터 있음 (단, `src/config`가 없어 실행 불가 → 본 작업에서 보조로 생성)
- `frontend/src/pages/Workspace.vue` — mock 데이터(`myWorkspaces`) 사용 중
- `frontend/src/types/index.ts` — `Workspace`, `WorkspaceMember`, `Role` 타입 정의됨
- `frontend/src/router/index.ts:17` — `/workspaces` 라우트 존재

**주의 (데이터 모델 간극)**: Planner.md는 workspace=workspace, 단일 board 병합 논의가 있었으나(b~h 각주), `schema.prisma`는 **List가 Workspace 하위**인 전통 구조로 확정됨. 본 문서는 schema.prisma(구현체) 기준으로 작성.

---

## 1. 사전 준비 (Prisma 클라이언트 + 인증 의존성)

> workspace CRUD는 "인증된 유저" 필요. 아직 auth 모듈이 비어있으므로, **본 작업 최소 범위에 필요한 것만** 만든다. (auth 전체 구현은 별도 담당)

### 1.1 `backend/src/config.ts` 생성 (시드/개발용 유저 ID)

`backend/prisma/seed.ts:7`이 `DEV_USER_ID`를 import하므로 누락된 파일 생성.

```ts
// backend/src/config.ts
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001'
export const PORT = Number(process.env.PORT ?? 3000)
export const IS_DEV = process.env.NODE_ENV !== 'production'
```

### 1.2 Prisma 클라이언트 싱글톤 생성

`backend/src/db.ts` 新規:

```ts
// backend/src/db.ts
import { PrismaClient } from '@prisma/client'
export const prisma = new PrismaClient()
```

### 1.3 패키지 + 빌드/시드 스크립트 설정

```bash
cd backend
npm install @prisma/client
npm install -D prisma zod ts-node typescript @types/node
```

> `package.json`에 현재 `express`만 있고 prisma가 명시되지 않음 (`backend/package.json:12-14`). `schema.prisma`/`seed.ts`가 있으므로 의존성 추가 필요.
> **중요**: `package.json:scripts`는 현재 `test` 스텁 하나뿐이라 본 가이드가 참조하는 `npm run db:seed`/`tsc --noEmit` 등이 동작하지 않는다. 반드시 아래 스크립트를 추가할 것.

```json
// backend/package.json — scripts 보강
{
  "dev": "ts-node-dev --respawn --transpile-only index.ts",
  "build": "tsc -p .",
  "typecheck": "tsc --noEmit -p .",
  "migrate": "prisma migrate deploy",
  "db:seed": "ts-node prisma/seed.ts",
  "db:reset": "prisma migrate reset --force && npm run db:seed"
}
```

### 1.3.1 `backend/tsconfig.json` 생성 (필수)

현재 `backend/`에는 `tsconfig.json`이 없다 (`tsconfig*.json` 없음 확인됨). `tsc --noEmit`/`npm run build`/`vue-tsc` 등 타입체크 단계가 전부 실패하므로 본 작업 전에 생성 필요. `prisma generate`가 생성하는 `@prisma/client` 타입과 `types/express.d.ts`(§1.4)를 인식하도록 다음 최소 설정을 사용:

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

### 1.4 개발용 인증 미들웨어 (임시)

auth 담당자가 완성 전까지 동작 확인용. **본 작업 완료 후 auth 담당자가 교체**. `IS_DEV` 가드로 프로덕션 빌드에 섞이는 것을 강제로 차단한다.

```ts
// backend/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express'
import { DEV_USER_ID, IS_DEV } from '../config'

// 개발용: 모든 요청을 DEV_USER로 간주. 프로덕션 로드 금지.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  // IS_DEV 가드: 프로덕션(NODE_ENV=production)에서 이 미들웨어가 로드되면 즉시 에러.
  // 단순 경고(§10.3) 대신 강제 계약으로 만들어 실수로 배포되는 것을 막는다.
  if (!IS_DEV) throw new Error('dev requireAuth must not be loaded outside development')
  req.user = { id: DEV_USER_ID }
  next()
}
```

> `express.Request`의 `.user` 타입 확장은 `backend/src/types/express.d.ts`에서 선언:

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

## 2. 백엔드: Workspace Service

`backend/src/modules/workspace/workspace.service.ts` 구현. **Prisma 직접 호출, 검증 로직 포함**.

### 2.1 함수 목록 (구현 순서)

| 함수 | 설명 | 권한 기준 |
|---|---|---|
| `listWorkspaces(userId)` | 내가 속한 워크스페이스 + 공개 워크스페이스 목록 | 인증 |
| `getWorkspace(userId, wsId)` | 단건 상세 (멤버 or 공개) | 인증 |
| `createWorkspace(userId, dto)` | 생성 + 생성자를 OWNER로 멤버십 등록 | 인증 |
| `updateWorkspace(userId, wsId, dto)` | name/is_public 부분 수정 | ADMIN 이상 |
| `deleteWorkspace(userId, wsId)` | 삭제 (cascade) | OWNER 전용 |

### 2.2 핵심 구현 메모

- **생성 트랜잭션**: `prisma.$transaction`으로 `workspace.create` + `workspaceMember.create(role: OWNER)` 동시 처리. Planner.md 348~357 "한 개의 보드 자동 생성"은 본 범위(워크스페이스 CRUD만) 제외 — 보드 담당자가 추가.
- **목록 조회 분리**: `prisma.workspace.findMany`를 두 번 호출
  - `my`: `members: { some: { user_id: userId } }`
  - `public`: `is_public: true, members: { none: { user_id: userId } }` (중복 제거)
- **단건 조회 권한**: 멤버십 존재 OR `is_public` true. 둘 다 아니면 403.
- **수정/삭제 권한**: 먼저 멤버십 조회 → role 체크. 없으면 403.
- **role 우선순위**: OWNER > ADMIN > MEMBER > VIEWER. 수정은 ADMIN 이상, 삭제는 OWNER 전용.
- **에러 던지기**: service는 `Error` subclass(`NotFoundError`, `ForbiddenError`) 던지고, controller에서 HTTP 상태 매핑.

```ts
// service 스켈레톤 (실제 작성 시 이 부분을 그대로 구현)
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
// listWorkspaces / getWorkspace / updateWorkspace / deleteWorkspace 동일 패턴
```

---

## 3. 백엔드: Workspace Controller

`backend/src/modules/workspace/workspace.controller.ts`. **HTTP 레이어만**: 입력 검증(zod 권장), service 호출, 응답 매핑.

### 3.1 입력 검증 (zod)

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
}).refine(v => v.name !== undefined || v.is_public !== undefined, { message: 'name 또는 is_public 중 하나는 필요' })
```

### 3.2 핸들러 매핑 (Router에 연결될 핸들러)

| HTTP | 경로 | 핸들러 | 권한 미들웨어 |
|---|---|---|---|
| GET | `/` | `list` | requireAuth |
| POST | `/` | `create` | requireAuth |
| GET | `/:workspaceId` | `getOne` | requireAuth |
| PUT | `/:workspaceId` | `update` | requireAuth |
| DELETE | `/:workspaceId` | `remove` | requireAuth |

> Planner.md 820~848줄 기준: **PUT** (PATCH 아님), 경로 파라미터 `workspace_id` 사용.

### 3.3 공통 에러 매핑 패턴

```ts
// controller 공통 패턴
try {
  const result = await service(...)
  return res.status(200).json(result) // 생성은 201
} catch (e) {
  if (e instanceof NotFoundError) return res.status(404).json({ error: '워크스페이스를 찾을 수 없습니다' })
  if (e instanceof ForbiddenError) return res.status(403).json({ error: '권한이 없습니다' })
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message })
  return res.status(500).json({ error: '서버 오류' })
}
```

### 3.4 응답 DTO (snake_case 통일 — schema.prisma 컨벤션 준수)

```ts
// Workspace → 응답 DTO
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

> 주의: Prisma는 `isPublic`(camelCase)로 반환하므로 controller에서 `is_public`, `created_at` 등으로 변환. 헬퍼 함수 `toWorkspaceDTO()` 권장.

참고 — `frontend/src/types/index.ts:3`에는 `Role = 'OWNER'|'EDITOR'|'VIEWER'|'MEMBER'`로 되어있으나, 이는 mock용이고 **schema.prisma의 `Role` enum(OWNER/ADMIN/MEMBER/VIEWER)이 정답**. 프론트 resize 시 수정 필요.

---

## 4. 백엔드: Router 완성

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

> `app.ts:15`는 이미 `/api/workspaces`로 마운트되어 있어 추가 변경 불필요.

---

## 5. 프론트엔드: API 클라이언트

### 5.1 HTTP 클라이언트 설치

```bash
cd frontend
npm install axios
```

> `package.json:12-14`에 HTTP 클라이언트 없음. fetch도 가능하나, 팀 convention이 axios로 가정(없으면 fetch 사용 고려).

### 5.2 `frontend/src/api/client.ts` 생성

```ts
import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,  // Planner.md 1034: credentials same-origin
})
```

### 5.3 `frontend/src/api/workspace.ts` 생성

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

> `frontend/src/types/index.ts`의 `Workspace` 인터페이스는 schema 기반으로 보완 필요:
> - `color` 제거 (DB에 없음, 프론트 mock용) 또는 클라이언트 파생
> - `member_count`는 API 응답에서 `members.length`로 계산
> - `role` enum을 `'OWNER'|'ADMIN'|'MEMBER'|'VIEWER'`로 정정

---

## 6. 프론트엔드: 페이지 연동

### 6.1 `Workspace.vue` mock → API 교체

`frontend/src/pages/Workspace.vue:9`의 `import { myWorkspaces } from '../mock/data'` 제거하고:

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

### 6.2 "새 프로젝트 추가" 카드에 생성 모달 연결

`Workspace.vue:50~56`의 `project-card--new` 클릭 시 모달 오픈 → `WorkspaceAPI.create()` 호출 후 목록 갱신.

### 6.3 (선택) 워크스페이스 수정/삭제 UI

워크스페이스 카드 우측 점菜单(`...`) 추가 → 드롭다운에 "수정"/"삭제" → 각각 `update`/`remove` 호출. **본 최소 범위에서는 생성/조회 우선, 수정·삭제 UI는 후순위 가능** (API는 완성해 두되 UI는 선택).

---

## 7. 검증 계획 (curl 테스트)

DB 마이그레이션 + 시드 실행 후:

```bash
# 전제: prisma generate로 @prisma/client 타입 생성 (안 하면 import 에러)
cd backend && npx prisma generate

# 마이그레이션 + 시드 (§1.3에서 정의한 npm 스크립트 사용)
npm run migrate && npm run db:seed

# 목록
curl -s http://localhost:3000/api/workspaces | jq

# 생성
curl -s -X POST http://localhost:3000/api/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"테스트 WS","is_public":false}' | jq

# 상세
curl -s http://localhost:3000/api/workspaces/00000000-0000-4000-8000-0000000000aa | jq

# 수정 (OWNER 권한 필요 — 개발 미들웨어가 DEV_USER를 OWNER로 시드)
curl -s -X PUT http://localhost:3000/api/workspaces/<id> \
  -H 'Content-Type: application/json' \
  -d '{"name":"수정됨"}' | jq

# 삭제
curl -s -X DELETE http://localhost:3000/api/workspaces/<id> | jq
```

타입체크 (모든 코드 작성 후, §1.3.1의 tsconfig.json 필요):

```bash
# backend: §1.3에서 정의한 typecheck 스크립트 (tsconfig.json 필수)
cd backend && npm run typecheck
# frontend
cd ../frontend && npm run build   # build 스크립트가 vue-tsc -b 포함 (package.json:8)
```

---

## 8. 체크리스트

- [ ] `backend/src/config.ts` 생성 (DEV_USER_ID, PORT, IS_DEV)
- [ ] `backend/tsconfig.json` 생성 (§1.3.1) — 없으면 typecheck/build 전부 실패
- [ ] `backend/package.json` scripts 보강 (§1.3: dev/build/typecheck/migrate/db:seed/db:reset)
- [ ] `backend/src/db.ts` Prisma 싱글톤
- [ ] `npx prisma generate` 실행 (@prisma/client 타입 생성 — 빠뜨리면 import 에러)
- [ ] `backend/src/middleware/auth.ts` 개발용 requireAuth + `types/express.d.ts`
- [ ] `backend/src/modules/workspace/workspace.service.ts` (5 함수 + 에러 클래스)
- [ ] `backend/src/modules/workspace/workspace.controller.ts` (zod 검증 + DTO 변환)
- [ ] `backend/src/modules/workspace/workspace.router.ts` (5 라우트)
- [ ] `backend/package.json` — `@prisma/client`, `prisma`, `zod`, `ts-node` 추가
- [ ] `backend/prisma/seed.ts` 실행 가능 상태 확인 (`npm run db:seed` 통과)
- [ ] `frontend/src/api/client.ts` + `api/workspace.ts`
- [ ] `frontend/src/types/index.ts` — Role enum 정정, Workspace 보완
- [ ] `frontend/src/pages/Workspace.vue` — mock → API 교체
- [ ] 생성 모달 UI 연결
- [ ] (선택) 수정·삭제 UI
- [ ] curl 통합 테스트 5개 전부 통과
- [ ] `npm run typecheck`(backend) + `npm run build`(frontend) 타입 에러 0

---

## 9. 범위 외 (명시)

본 문서는 **워크스페이스 CRUD만** 다룸. 아래는 별도 담당/별도 문서:
- 멤버 초대(`POST /workspaces/{id}/members`), 권한 변경(`PUT .../members/{uid}`), 멤버 제거(`DELETE .../members/{uid}`)
- 보드 자동 생성 (Planner.md 357 "한 개의 보드 자동 생성" — 보드 담당자와 협의)
- 실제 JWT/session 인증 (auth 담당자)
- WebSocket 실시간 동기화
- Redis 캐싱

---

## 10. 위험/주의사항

1. **Prisma 클라이언트 미생성**: `npx prisma generate` 먼저 실행 안 하면 `@prisma/client` import 시 에러. (`dprisma/schema.prisma` generator 설정 있음)
2. **Express 5**: `package.json:13`에 `express@^5.2.1`. Express 5는 `@types/express@5`와 일치 (`devDependencies` OK). 라우트에서 `req.params.workspaceId` 동작 확인 (Express 4와 동일).
3. **개발용 미들웨어 보안**: `requireAuth`가 `DEV_USER_ID` 하드코딩. auth 완성 전까지 사용, 완성 즉시 교체. 절대 프로덕션 빌드에 포함 금지 (`IS_DEV` 가드 권장).
4. **DTO 변환 누락**: Prisma 기본 반환은 camelCase (`isPublic`, `createdAt`). 응답은 snake_case 통일(schema.prisma 주석 4~7줄). 빠뜨리면 프론트가 깨짐.
5. **권한 401 vs 403**: 미들웨어 통과하면 무조건 `user.id` 있음(개발). 실제 auth 연동 시 인증 안 됨=401, 권한 부족=403 분리 필요.
