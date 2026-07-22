# 인증·계정 API 명세

로컬 기준 Base URL은 `http://localhost:8080`이다. JSON API는 `/api` 아래에 있고,
Google Cloud에 등록된 호환 콜백만 `/oauth/google` 경로를 추가로 사용한다.

## 공통 규칙

- 요청과 응답 본문: `application/json`
- Access Token: 응답 본문으로 발급되는 JWT이며 기본 유효기간은 15분이다.
- 인증 헤더: `Authorization: Bearer <access_token>`
- Refresh Token: `ft_refresh_token` HttpOnly 쿠키로만 발급된다. 기본 유효기간은 7일이고
  쿠키 경로는 `/api/auth`이다.
- 상태 변경 요청의 `Origin` 헤더가 존재하면 `APP_ORIGIN`과 정확히 일치해야 한다.
- 이메일은 앞뒤 공백을 제거하고 소문자로 저장한다.
- 비밀번호는 8~128자이며 `scrypt` 해시만 데이터베이스에 저장한다.
- 로그인은 동일 IP·이메일 조합에서 15분 동안 10회 실패하면 일시 제한된다.

일반 오류 응답 형식:

```json
{
  "status_code": 401,
  "error": "INVALID_CREDENTIALS",
  "message": "Email or password is incorrect"
}
```

## 상태 확인

### `GET /api/health`

인증 없이 서버 상태를 확인한다.

```json
{ "status": "ok" }
```

## 수동 회원가입·로그인

### `POST /api/auth/signup`

이메일/비밀번호 계정을 생성하고 즉시 로그인 세션을 발급한다.

요청:

```json
{
  "name": "홍길동",
  "email": "user@example.com",
  "password": "password-1234"
}
```

검증 규칙:

- `name`: 공백 제거 후 2~80자
- `email`: 유효한 이메일 형식, 최대 254자
- `password`: 8~128자

성공: `201 Created`, Refresh Token 쿠키와 아래 응답을 반환한다.

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "홍길동",
    "profile_image_url": null,
    "created_at": "2026-07-22T00:00:00.000Z"
  },
  "access_token": "jwt",
  "token_type": "Bearer",
  "expires_in": 900
}
```

주요 오류:

- `400 INVALID_NAME`
- `400 INVALID_EMAIL`
- `400 INVALID_PASSWORD`
- `409 EMAIL_ALREADY_REGISTERED`

### `POST /api/auth/login`

이메일/비밀번호를 검증하고 로그인 세션을 발급한다.

요청:

```json
{
  "email": "user@example.com",
  "password": "password-1234"
}
```

성공: `200 OK`. 응답과 쿠키는 회원가입 성공 응답과 같다.

주요 오류:

- `401 INVALID_CREDENTIALS`: 이메일 미가입, OAuth 전용 계정, 비밀번호 불일치를 구분하지 않는다.
- `429 LOGIN_RATE_LIMITED`: 동일 IP·이메일 조합의 로그인 실패 횟수 초과

## Google OAuth

### `GET /api/auth/oauth/google`

Google Authorization Code Flow를 시작한다.

선택 쿼리:

- `return_to`: 로그인 완료 후 이동할 앱 내부 절대 경로. 기본값은 `/workspaces`이다.

성공: Google 로그인 화면으로 `302 Found` 리디렉션하고, 일회용 OAuth 상태값을
`ft_oauth_state` HttpOnly 쿠키에 저장한다.

### `GET /api/auth/oauth/callback/google`

백엔드의 정규 Google 콜백이다. Google이 전달하는 `code`와 `state`를 검증하고,
Google ID Token의 서명·audience·이메일 인증 여부·nonce를 검증한다.

### `GET /oauth/google`

현재 Google Cloud에 등록된 로컬 콜백 URI와의 호환 경로다.

```text
http://localhost:8080/oauth/google
```

콜백 성공 시 Refresh Token 쿠키를 발급하고 `return_to`로 `302` 리디렉션한다.
실패 시 `/signin?oauth_error=<code>`로 리디렉션한다.

## 세션

### `POST /api/auth/refresh`

Refresh Token 쿠키를 회전시키고 새 Access Token을 발급한다. 요청 본문은 없다.

성공: `200 OK`

```json
{
  "access_token": "jwt",
  "token_type": "Bearer",
  "expires_in": 900
}
```

주요 오류:

- `401 MISSING_REFRESH_TOKEN`
- `401 INVALID_REFRESH_TOKEN`

### `POST /api/auth/logout`

현재 Refresh Token 세션을 폐기하고 쿠키를 제거한다. 멱등적으로 동작한다.

성공: `204 No Content`

## 내 계정

아래 API는 모두 `Authorization: Bearer <access_token>` 헤더가 필요하다.

### `GET /api/auth/me`

현재 사용자 정보를 반환한다.

성공: `200 OK`

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "홍길동",
  "profile_image_url": null,
  "created_at": "2026-07-22T00:00:00.000Z"
}
```

### `PATCH /api/auth/account`

현재는 표시 이름만 수정한다.

요청:

```json
{ "name": "새 이름" }
```

성공: `200 OK`, 수정된 사용자 정보를 반환한다.

주요 오류: `400 INVALID_NAME`

### `DELETE /api/auth/account`

사용자와 연결된 OAuth 계정 및 현재 사용자의 모든 Refresh Token 세션을 삭제하고
현재 쿠키를 제거한다.

성공: `204 No Content`

## 공통 인증 오류

- `401 UNAUTHORIZED`: Bearer 토큰 없음
- `401 INVALID_ACCESS_TOKEN`: 토큰 만료 또는 검증 실패
- `403 INVALID_ORIGIN`: 허용되지 않은 브라우저 Origin
- `404 USER_NOT_FOUND`: 토큰 사용자가 더 이상 존재하지 않음
- `500 AUTH_INTERNAL_ERROR`: 처리 중 예상하지 못한 오류

`/privacy`와 `/terms`는 공개 프런트엔드 페이지이며 JSON API가 아니다.
