# 구현 시 고려사항

## Auth

- **refresh_token은 body에 포함하지 않는다.**
  HttpOnly + Secure 쿠키로만 내려야 JS가 토큰에 접근할 수 없어 XSS 방어가 가능하다.
  `LoginResponse`, `RefreshResponse` 모두 동일.

- **password는 HTTPS 위에서만 평문 전송한다.**
  서버 수신 후 즉시 해싱(`password_hash`)하여 저장. `password_hash`는 어떤 응답에도 포함하지 않는다.

- **OAuth 콜백의 `state` 값은 반드시 대조한다.**
  시작 시 서버가 발급한 state와 콜백으로 돌아온 state가 일치해야 CSRF 방어가 된다.

---

## Users

- **`GET /users/{user_id}/profile`은 공개 프로필이다.**
  email 등 민감 정보를 제외한다. 본인 정보는 `GET /auth/me`(`UserPublic`)를 사용한다.

- **프로필 수정 시 `profile_image_url: null`을 허용한다.**
  null을 보내면 이미지를 제거하는 것으로 처리한다.

---

## Workspaces

- **워크스페이스 생성 시 생성자를 자동으로 OWNER로 등록해야 한다.**
  DBML에 `owner_id` 컬럼이 없으므로 `WorkspaceMembers`에 `OWNER` role 행을 서비스 계층에서 직접 삽입한다.

- **마지막 OWNER 강등/제거를 막아야 한다.**
  `PUT /workspaces/{workspace_id}/members/{user_id}`와 `DELETE` 시 OWNER가 0명이 되는 상황을 서비스에서 검증한다.

- **워크스페이스 삭제는 cascade로 Lists, Cards, Labels 등이 연쇄 삭제된다.**
  OWNER만 삭제할 수 있도록 권한 검증이 필요하다.

- **현재 멤버 초대는 7일 JWT 링크를 사용하는 프로토타입이다.**
  가입 전 이메일에도 보낼 수 있으며, 수락 시 로그인 계정의 정규화 이메일이
  초대 이메일과 같아야 한다. 초대 목록·취소·재전송이 필요해질 때 영속 초대
  모델을 추가하고, 그전에는 별도 상태 테이블을 두지 않는다.

---

## Lists

- **`sequence`는 fractional indexing용 float이다.**
  중간 삽입을 반복하면 두 리스트의 sequence가 같아지는 정밀도 고갈이 발생할 수 있다.
  → 순서 변경 응답에 항상 갱신된 sequence를 포함하고, 주기적 rebalancing 로직을 준비한다.

- **리스트 순서 변경 시 클라이언트가 직접 sequence 값을 보내지 않는다.**
  `before_list_id` / `after_list_id`(이웃 id)를 받아 서버가 사이값을 계산하는 방식을 사용한다.

- **리스트 삭제 시 카드는 삭제되지 않는다.**
  `Cards.list_id`는 `[delete: set null]`이므로 카드가 inbox 상태(`list_id = null`)로 전환된다.
  이 동작이 의도된 것인지 팀 내에서 확인 필요.

- **리스트의 다른 워크스페이스 이동은 폐기된 기능이다.**
  워크스페이스 간 이동 시 라벨·멤버 깨짐 문제가 있으므로 `PUT /lists/{list_id}/move`는 구현하지 않는다.

---

## Cards

- **`CardDto.user_id`(inbox 소유자)와 담당자(assignee)는 다르다.**
  담당자는 `CardMembers`(N:M) 테이블로 별도 관리한다. 응답에서 둘을 혼동하지 않아야 한다.

- **카드 수정(`PUT /cards/{card_id}`)은 부분 수정이다.**
  - 필드 없음(undefined) = 유지
  - `null` = 값 제거

- **카드 이동(`PUT /cards/{card_id}/move`) 시 대상 리스트가 같은 워크스페이스인지 반드시 검증한다.**
  다른 워크스페이스로 이동하면 라벨·멤버 데이터 누수가 발생한다.

- **카드 이동과 동시에 순서도 결정해야 한다.**
  `MoveCardRequest`에 `before_card_id` / `after_card_id`를 함께 받는다.

- **날짜 수정(`PATCH /cards/{card_id}/dates`) 시 `start_at <= deadline` 검증이 필요하다.**
  한쪽만 있는 경우는 허용한다(트렐로 방식).

- **카드를 inbox로 이동하면 sequence 값이 의미를 잃는다.**
  서버에서 sequence를 정리하는 처리가 필요하다.

- **카드 삭제는 cascade로 CardMembers, CardLabel, Attachments, Comment가 연쇄 삭제된다.**

- **첨부파일 삭제(`DELETE /cards/attachments/{attachment_id}`)는 경로에 `card_id`가 없다.**
  `attachment_id`만으로 소유 카드와 워크스페이스 권한을 역추적해서 검증해야 한다.

- **카드 멤버(담당자) 추가 시 해당 유저가 워크스페이스 멤버인지 검증해야 한다.**

---

## Comments

- **댓글 수정은 본인만 가능하다.**
  `user_id` 일치 여부를 서비스에서 검증한다.

- **댓글 삭제는 본인 또는 워크스페이스 ADMIN/OWNER만 가능하다.**
  권한 정책을 명확히 문서화하고 서비스에서 구현한다.

- **`user_id`는 인증 토큰에서 추출한다.**
  Request body로 받지 않아 위변조를 방지한다.

---

## Labels

- **라벨은 워크스페이스에 종속된다.**
  카드를 다른 워크스페이스로 이동하면 라벨이 따라가지 않는다. 이 동작이 의도된 것인지 확인 필요.

- **라벨 삭제(`DELETE /labels/{label_id}`)는 cascade로 CardLabel이 연쇄 삭제된다.**
  해당 라벨이 붙은 모든 카드에서 자동으로 제거된다. 삭제 전 사용자에게 경고 UI가 필요할 수 있다.

- **카드에 라벨을 부착할 때 해당 라벨이 카드가 속한 워크스페이스의 라벨인지 검증한다.**
  다른 워크스페이스의 라벨을 부착하는 것을 막아야 한다.

---

## Misc (Inbox / Calendar / Search)

- **Inbox 카드의 생성·수정·삭제·이동은 모두 Cards API로 처리한다.**
  inbox 전용 mutation 엔드포인트는 두지 않는다.

- **달력 조회(`GET /workspaces/{workspace_id}/calendar?month=YYYY-MM`)의 "걸침" 기준을 명확히 한다.**
  카드 기간 `[start_at, deadline]`이 요청 월의 `[월초, 월말]`과 겹치면 포함한다.
  `start_at`과 `deadline`이 모두 `null`인 카드는 달력에 표시하지 않는다.

- **달력 쿼리의 `month` 파라미터는 `YYYY-MM` 형식만 허용한다.**
  서버에서 형식 검증 필수.

- **검색 결과는 내가 접근 가능한 워크스페이스 범위로만 제한한다.**
  권한이 없는 워크스페이스의 카드·댓글이 노출되지 않아야 한다.

- **검색 쿼리 `q`가 빈 문자열인 경우 처리 정책을 결정한다.**
  400 반환 또는 빈 배열 반환 중 하나를 선택하여 일관되게 적용한다.

---

## 공통

- **모든 날짜는 ISO-8601 문자열로 주고받는다.**
  JSON에 `Date` 타입이 없으므로 서버 컨트롤러/서비스에서 파싱 책임을 진다.

- **에러 응답은 `ErrorResponse` 형식으로 통일한다.**
  `status_code`, `error`(코드성 문자열), `message`(사람이 읽을 설명) 세 필드.

- **인증이 필요한 모든 엔드포인트는 JWT Bearer 토큰을 검증한다.**
  토큰 만료 시 `POST /auth/refresh`로 재발급(refresh_token은 HttpOnly 쿠키에서 읽음).
