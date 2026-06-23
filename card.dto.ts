// ============================================================
// card.dto.ts — Cards (생성 통합 + Inbox 흡수), Attachments, Members
// ============================================================
import { UUID, ISODateString } from './common.dto';
import { CardMemberBrief, CardLabelBrief } from './workspace.dto';

// ------------------------------------------------------------
// POST /cards   ★ 생성 통합
//   list_id 있으면 보드 카드, 없으면(null/생략) 인박스 카드
//   ⚠️ 인박스 카드는 서버가 user_id = 요청 유저로 귀속
// ------------------------------------------------------------
export interface CreateCardRequest {
  list_id?: UUID | null;   // null/생략 → 인박스 카드
  title: string;
  description?: string;
  deadline?: ISODateString | null;
}
export interface CardDto {
  id: UUID;
  list_id: UUID | null;    // null = 인박스 카드
  user_id: UUID | null;    // 보드 카드의 생성자 / 인박스 카드의 소유자
  title: string;
  description: string;
  deadline: ISODateString | null;
  sequence: number;
  created_at: ISODateString;
}
export type CreateCardResponse = CardDto; // 201

// ------------------------------------------------------------
// GET /cards/{card_id}  (상세 — 연관 데이터 포함)
// ------------------------------------------------------------
export interface AttachmentDto {
  id: UUID;
  card_id: UUID;
  file_url: string;
  file_name: string;
  created_at: ISODateString;
}
export interface CommentDto {
  id: UUID;
  card_id: UUID;
  user_id: UUID;           // ⚠️ Comment.user_id 스키마 추가 전제
  comment_str: string;
  author_name: string;     // 조인 결과 (프론트 N+1 방지)
  created_at: ISODateString;
  updated_at?: ISODateString; // ⚠️ Comment.updated_at 추가 시
}
export interface CardDetailResponse extends CardDto {
  members: CardMemberBrief[];
  labels: CardLabelBrief[];
  attachments: AttachmentDto[];
  comments: CommentDto[];
}

// ------------------------------------------------------------
// PUT /cards/{card_id}  (수정 — 위치 무관)
//   ⚠️ 공통 권한 검증 필수:
//     list_id == null  → card.user_id == 토큰 유저 (인박스: 소유자 본인)
//     list_id != null  → 워크스페이스 멤버십/역할 검증
// ------------------------------------------------------------
export interface UpdateCardRequest {
  title?: string;
  description?: string;
}
export interface UpdateCardResponse {
  id: UUID;
  title: string;
  description: string;
}

// DELETE /cards/{card_id} → 204  (위 공통 권한 검증 동일 적용)

// ------------------------------------------------------------
// PUT /cards/{card_id}/order   (같은 리스트 내 순서)
// ------------------------------------------------------------
export interface ReorderCardRequest {
  ordered_card_ids: UUID[];
}
// Response 200 → MessageResponse

// ------------------------------------------------------------
// PUT /cards/{card_id}/move   (이동 통합: list↔list, inbox→list)
//   target_list_id = null 이면 인박스로 보내기와 동일
//   ⚠️ target_list_id 가 같은 워크스페이스 소속인지 검증
//   ⚠️ inbox→board 시 소유권/멤버십 전환 검증
// ------------------------------------------------------------
export interface MoveCardRequest {
  target_list_id: UUID | null;
  sequence: number;
}
export interface MoveCardResponse {
  id: UUID;
  list_id: UUID | null;
  sequence: number;
}

// ------------------------------------------------------------
// PUT /cards/{card_id}/inbox   (보드 → 개인 인박스)
//   list_id = NULL, user_id = 요청 유저
// ------------------------------------------------------------
export interface MoveToInboxResponse {
  id: UUID;
  list_id: null;
  user_id: UUID;
}

// ------------------------------------------------------------
// PUT /cards/{card_id}/due-date
// ------------------------------------------------------------
export interface SetDueDateRequest {
  deadline: ISODateString | null;   // null 이면 마감일 제거
}
export interface SetDueDateResponse {
  id: UUID;
  deadline: ISODateString | null;
}

// ------------------------------------------------------------
// Card Members
//   POST /cards/{card_id}/members
//   ⚠️ 지정 대상이 워크스페이스 멤버인지 검증 (422 NOT_WORKSPACE_MEMBER)
// ------------------------------------------------------------
export interface AddCardMemberRequest {
  user_id: UUID;
}
export interface AddCardMemberResponse {
  card_id: UUID;
  user_id: UUID;
  name: string;
}
// DELETE /cards/{card_id}/members/{user_id} → 204

// ------------------------------------------------------------
// Attachments
//   POST /cards/{card_id}/attachments  (multipart/form-data, key=file)
//   ⚠️ 확장자/MIME 화이트리스트 검증 (악성 파일 차단)
// ------------------------------------------------------------
export type AddAttachmentResponse = AttachmentDto; // 201
// DELETE /cards/attachments/{attachment_id} → 204
