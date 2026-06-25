// ============================================================
// misc.dto.ts — Inbox / Calendar / Search (조회 중심)
// ============================================================
import { UUID, ISODateString } from './common.dto';
import { CardDto } from './cards.dto';

// ============================================================
// Inbox
// ============================================================
// ------------------------------------------------------------
// GET /inbox  → 200
//   list_id IS NULL 인 "내" 카드 목록 (user_id = 로그인 유저).
//   ⚠️ inbox 의 생성/수정/삭제/이동은 모두 Cards API 로 통합됨:
//      - 생성: POST /lists/{list_id}/cards (inbox 직접 생성이 필요하면 별도 검토)
//      - 수정: PUT /cards/{card_id}
//      - 삭제: DELETE /cards/{card_id}
//      - 보드로 이동: PUT /cards/{card_id}/move
//      - inbox 로 이동: PUT /cards/{card_id}/inbox
//   → 따라서 inbox 전용 mutation DTO 는 두지 않는다.
// ------------------------------------------------------------
export type GetInboxResponse = CardDto[];

// ============================================================
// Calendar
// ============================================================
// ------------------------------------------------------------
// GET /workspaces/{workspace_id}/calendar?month=YYYY-MM  → 200
//   (기존 /boards/{board_id}/events 폐기 → 이걸로 대체)
//   start_at ~ deadline 구간이 해당 월에 걸치는 카드들을 반환.
//   ⚠️ "걸친다"의 정의를 명확히:
//      카드 기간 [start_at, deadline] 이 해당 월 [월초, 월말] 과
//      겹치면 포함. (시작이 지난달이고 마감이 이번달이어도 포함)
//   ⚠️ start_at/deadline 이 둘 다 null 인 카드는 달력에 안 뜸.
// ------------------------------------------------------------
export interface CalendarQuery {
  month: string;   // "YYYY-MM" 형식. 서버에서 형식 검증 필수.
}

/** 달력용 경량 카드 표현 (상세 전체를 줄 필요 없음) */
export interface CalendarCardDto {
  id: UUID;
  list_id: UUID | null;
  title: string;
  start_at: ISODateString | null;
  deadline: ISODateString | null;
}
export type GetCalendarResponse = CalendarCardDto[];

// ============================================================
// Search
// ============================================================
// ------------------------------------------------------------
// GET /search?q={keyword}  → 200
//   전체 검색. 무엇을 검색 대상으로 할지(카드 제목/설명/댓글/라벨 등)
//   범위를 정해야 함. 여기선 카드 중심 + 타입 태깅으로 둔다.
//   ⚠️ q 가 빈 문자열이면 400 또는 빈 배열 반환 정책 결정.
//   ⚠️ 권한: 내가 접근 가능한 워크스페이스 범위로만 결과 제한.
// ------------------------------------------------------------
export interface SearchQuery {
  q: string;
}

export interface SearchResultItem {
  type: 'card' | 'workspace' | 'comment';
  id: UUID;
  title: string;            // 매칭된 대상의 대표 텍스트
  workspace_id: UUID;       // 어느 워크스페이스 소속인지
  snippet?: string;         // 매칭 주변 텍스트(선택)
}
export type SearchResponse = SearchResultItem[];
