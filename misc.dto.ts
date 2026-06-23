// ============================================================
// misc.dto.ts — Comments, Labels, Inbox, Calendar, Search
// ============================================================
import { UUID, ISODateString } from './common.dto';
import { CardDto } from './card.dto';

// ============================================================
// Comments
//   ⚠️ Comment.user_id 스키마 추가 전제 (작성자 식별 / 권한 검증)
// ============================================================

// POST /cards/{card_id}/comments
export interface CreateCommentRequest {
  comment_str: string;
}
export interface CommentResponse {
  id: UUID;
  card_id: UUID;
  user_id: UUID;
  comment_str: string;
  author_name: string;
  created_at: ISODateString;
}

// PATCH /comments/{comment_id}   (부분 수정 → PATCH)
//   ⚠️ comment.user_id == 토큰 유저 검증 (IDOR 방지)
export interface UpdateCommentRequest {
  comment_str: string;
}
export interface UpdateCommentResponse {
  id: UUID;
  comment_str: string;
  updated_at: ISODateString;   // ⚠️ Comment.updated_at 추가 전제
}

// DELETE /comments/{comment_id} → 204  (작성자 또는 ADMIN/OWNER)

// ============================================================
// Labels
//   ⚠️ Label.workspace_id, Label.color 스키마 추가 전제
// ============================================================

export interface LabelDto {
  id: UUID;
  label_name: string;
  color?: string;
}

// GET /workspaces/{workspace_id}/labels
export interface LabelListResponse {
  labels: LabelDto[];
}

// POST /workspaces/{workspace_id}/labels
export interface CreateLabelRequest {
  label_name: string;
  color?: string;
}
export interface CreateLabelResponse {
  id: UUID;
  workspace_id: UUID;
  label_name: string;
  color?: string;
  created_at: ISODateString;
}

// DELETE /labels/{label_id} → 204  (CardLabel 연결 CASCADE 삭제)

// POST /cards/{card_id}/labels   (부착 — 기존 라벨 id)
//   ⚠️ 라벨이 카드와 같은 워크스페이스 소속인지 검증
export interface AttachLabelRequest {
  label_id: UUID;
}
export interface AttachLabelResponse {
  card_id: UUID;
  label_id: UUID;
  label_name: string;
  color?: string;
}
// DELETE /cards/{card_id}/labels/{label_id} → 204  (연결만 끊김, 라벨은 유지)

// ============================================================
// Inbox  (조회 전용 — 생성/수정/삭제/이동은 Cards API 로 통합)
// ============================================================

// GET /inbox   (본인 카드, list_id = NULL)
export interface InboxListResponse {
  cards: Pick<CardDto, 'id' | 'title' | 'description' | 'deadline' | 'created_at'>[];
}

// ============================================================
// Calendar  (Event 테이블 없음 — Card.deadline 기반 뷰)
// ============================================================

// GET /workspaces/{workspace_id}/calendar?month=YYYY-MM
//   ⚠️ 월 경계: deadline >= 'YYYY-MM-01' AND deadline < '다음달-01' (<= 말일 아님)
//   ⚠️ WHERE deadline IS NOT NULL + deadline 인덱스
//   ⚠️ month 형식 검증 정규식: ^\d{4}-(0[1-9]|1[0-2])$
export interface CalendarQuery {
  month: string;   // "YYYY-MM"
}
export interface CalendarCard {
  id: UUID;
  title: string;
  deadline: ISODateString;
  list_id: UUID;
  list_name: string;
}
export interface CalendarResponse {
  month: string;
  cards: CalendarCard[];
}

// ============================================================
// Search
//   ⚠️ 내가 멤버인 워크스페이스로 결과 제한 (정보 유출 방지)
// ============================================================

// GET /search?q={keyword}
export interface SearchQuery {
  q: string;
}
export interface SearchResponse {
  query: string;
  results: {
    cards: { id: UUID; title: string; list_id: UUID; workspace_id: UUID }[];
    lists: { id: UUID; name: string; workspace_id: UUID }[];
    comments: { id: UUID; comment_str: string; card_id: UUID }[];
  };
}
