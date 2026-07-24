# TaskFlow — 팀 협업 규칙

## 팀 구성
- **PO**: 남영훈 (ynam)
- **PM**: 김창완 (chakim)
- **TL**: 김연준 (yeonjuki)
- **Dev**: 조인철 (injo), 최우녕 (wchoe)

## 기술 스택
- **Frontend**: Vue 3 (Composition API) + TypeScript, Vite 8
- **Backend**: Express 5 + TypeScript, ts-node-dev
- **Database**: PostgreSQL 15 (Prisma ORM)
- **Cache**: Redis 7
- **Reverse Proxy**: Nginx (SSL terminated, self-signed cert)
- **Container**: Docker Compose (5 services)
- **Auth**: JWT (access + refresh, HttpOnly cookies) + Google OAuth 2.0
- **Mail**: Nodemailer 9 (SMTP)
- **Validation**: Zod 4
- **Docs**: Swagger UI Express
- **Real-time**: Socket.IO (planned)

## 프로젝트 규칙

### 인증 및 보안
- refresh_token은 절대 body에 포함하지 않고 HttpOnly + Secure 쿠키로만 내린다.
- password_hash는 어떤 응답에도 포함하지 않는다.
- OAuth state 값은 반드시 콜백에서 대조한다.
- 모든 인증 필요 엔드포인트는 JWT Bearer 토큰 검증 (authMiddleware).
- 세션은 httpOnly 쿠키 사용, credentials: 'same-origin'.

### API 규칙
- 에러 응답은 `{ error: "메시지" }` 형식으로 통일.
- 상태 코드: 400 (검증), 401 (인증), 403 (권한), 404 (리소스), 500 (서버 오류).
- 모든 날짜는 ISO-8601 문자열로 주고받는다.
- Request body는 Zod로 검증.
- 카드/리스트 순서는 서버에서 fractional indexing으로 계산, 클라이언트는 이웃 id만 전송.

### 멤버 초대 (메일)
- 공유는 메일 링크 초대로 한정 (mail.to).
- 초대 토큰은 JWT (7일 만료), 초대 링크는 `{APP_ORIGIN}/invite/{token}`.
- 초대받은 이메일이 존재하지 않는 유저일 경우: 초대 보류 처리 (404 반환하지 않음).
- SMTP 설정은 `.env`의 `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### 권한 체계
- **OWNER**: 워크스페이스 소유자. ADMIN 부여, 워크스페이스 삭제 가능.
- **ADMIN**: 보드 생성/삭제, 멤버 초대/제거 가능.
- **MEMBER**: 카드/리스트 CRUD, 파일 첨부 가능.
- **VIEWER**: 읽기 전용.

### 워크스페이스 규칙
- 워크스페이스 생성 시 생성자를 OWNER로 자동 등록.
- 마지막 OWNER는 강등/제거 불가 (OWNER 0명 방지).
- 삭제 시 Lists, Cards, Labels 등 cascade 연쇄 삭제.

### 카드 규칙
- 카드 수정은 부분 수정: undefined → 유지, null → 제거.
- 카드 이동 시 대상 리스트가 같은 워크스페이스인지 검증 (라벨/멤버 누수 방지).
- startDate ≤ dueDate 검증 필요.
- 첨부파일 삭제는 attachment_id만으로 소유 카드/워크스페이스 권한 역추적.

### 깃 브랜치 및 트렐로 워크플로우
- 카드는 Backlog → To-do → WIP → Review → Done 순서로 이동.
- WIP는 개인당 1~2개로 제한.
- 담당자 라벨: 주황(Yeonjuki), 초록(ynam), 보라(injo), 노랑(chakim), 분홍(wchoe).
- 블로커 발생 시 🔴 Waiting 라벨 부착.
- 후순위 작업은 🔵 스트레치 라벨.

### Docker / Makefile
- `make up`: 빌드 후 구동 (docker compose up -d --build)
- `make down`: 컨테이너 종료
- `make clean`: 볼륨 포함 삭제 (down -v)
- `make fclean`: 전체 초기화 (docker system prune -a --force)
- `make re`: 완전 초기화 후 재구동

### 환경 변수 (.env)
```
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI
APP_ORIGIN=https://localhost:4430
JWT_ACCESS_SECRET (openssl rand -base64 48)
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
OAUTH_AUTO_LINK_VERIFIED_EMAIL=true
```

### 포트
- 4430: Nginx (HTTPS)
- 3000: Backend (내부)
- 5173: Frontend (내부)
- 5432: PostgreSQL (내부)
- 6379: Redis (내부)
