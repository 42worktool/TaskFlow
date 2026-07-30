// ============================================================
// cards.dto.ts — Cards (+ Members, Attachments, Inbox 통합)
// ============================================================
import { UUID, ISODateString } from './common.dto';

// ------------------------------------------------------------
// 공용: 카드 표현
//   DBML Cards: id, list_id(null 가능=inbox), user_id(null 가능=inbox owner),
//               title, description, is_completed, start_at, deadline,
//               sequence, created_at
//   ⚠️ user_id 는 "inbox 카드 소유자"이지 "담당자"가 아니다.
//      담당자(assignee)는 CardMembers(N:M) 로 따로 관리.
//      → 응답에서 둘을 분명히 구분해야 한다.
// ------------------------------------------------------------
export interface CardDto {
  id: UUID;
  list_id: UUID | null;          // null = inbox 카드
  title: string;
  description: string | null;
  is_completed: boolean;
  start_at: ISODateString | null;
  deadline: ISODateString | null;
  sequence: number;
  created_at: ISODateString;
  members?: CardMemberDto[];      // 상세 조회 시 포함
  labels?: CardLabelDto[];        // 상세 조회 시 포함
  attachments?: AttachmentDto[];  // 상세 조회 시 포함
}

/** 카드 담당자 (CardMembers + Users 조인) */
export interface CardMemberDto {
  user_id: UUID;
  name: string;
  profile_image_url: string | null;
}

/** 카드에 붙은 라벨 (CardLabel + Label 조인) */
export interface CardLabelDto {
  label_id: UUID;
  label_name: string;
  label_color: string;
}

/** 첨부파일 (Attachments) */
export interface AttachmentDto {
  id: UUID;
  card_id: UUID;
  file_url: string;
  file_name: string;
  created_at: ISODateString;
}

// ------------------------------------------------------------
// POST /lists/{list_id}/cards  → 201
//   특정 리스트 안에 카드 생성. list_id 는 경로에서 받음.
// ------------------------------------------------------------
export interface CreateCardRequest {
  title: string;
  description?: string | null;
  start_at?: ISODateString | null;
  deadline?: ISODateString | null;
  // sequence 는 서버가 "맨 뒤"로 자동 계산.
}
export type CreateCardResponse = CardDto;

// ------------------------------------------------------------
// GET /cards/{card_id}  → 200
//   상세 (members/labels/attachments 포함)
// ------------------------------------------------------------
export type GetCardResponse = CardDto;

// ------------------------------------------------------------
// PUT /cards/{card_id}  → 200
//   제목/설명 수정.
//   ⚠️ 부분 수정 의도면 PATCH 권장. 서버는 '키 존재 여부'로 반영:
//      - 필드 없음(undefined) = 유지
//      - null = 값 제거
// ------------------------------------------------------------
export interface UpdateCardRequest {
  title?: string;
  description?: string | null;
}
export type UpdateCardResponse = CardDto;

// ------------------------------------------------------------
// DELETE /cards/{card_id}  → 204 (body 없음)
//   ⚠️ cascade: CardMembers, CardLabel, Attachments, Comment 연쇄 삭제.
// ------------------------------------------------------------

// ------------------------------------------------------------
// PUT /cards/{card_id}/order  → 200
//   같은 리스트 내 순서 변경. (리스트 reorder 와 동일 패턴)
// ------------------------------------------------------------
export interface ReorderCardRequest {
  before_card_id?: UUID | null;
  after_card_id?: UUID | null;
}
export type ReorderCardResponse = CardDto;

// ------------------------------------------------------------
// PUT /cards/{card_id}/move  → 200
//   다른 리스트로 이동.
//   ⚠️ 대상 리스트가 "같은 워크스페이스"인지 서버에서 반드시 검증.
//      안 그러면 워크스페이스 경계를 넘는 데이터 누수 발생.
//   ⚠️ 이동과 동시에 위치(순서)도 정해야 함 → before/after 같이 받음.
// ------------------------------------------------------------
export interface MoveCardRequest {
  list_id: UUID;                  // 이동할 대상 리스트
  before_card_id?: UUID | null;
  after_card_id?: UUID | null;
}
export type MoveCardResponse = CardDto;

// ------------------------------------------------------------
// PATCH /cards/{card_id}/dates  → 200
//   시작일/마감일 설정. (기존 /due-date 를 /dates 로 통합)
//   ⚠️ 부분 수정 의미의 PATCH:
//      - 필드 없음(undefined) = 해당 날짜 유지
//      - null = 해당 날짜 제거
//   ⚠️ 검증: 둘 다 있으면 start_at <= deadline. 한쪽만 있어도 OK.
//      트렐로처럼 deadline 단독 설정 / start_at 단독 설정 모두 허용.
// ------------------------------------------------------------
export interface UpdateCardDatesRequest {
  start_at?: ISODateString | null;
  deadline?: ISODateString | null;
}
export type UpdateCardDatesResponse = CardDto;

// ------------------------------------------------------------
// PATCH /cards/{card_id}/completion  → 200
//   리스트 위치를 바꾸지 않고 카드 자체의 완료 여부를 명시적으로 변경.
// ------------------------------------------------------------
export interface UpdateCardCompletionRequest {
  is_completed: boolean;
}
export type UpdateCardCompletionResponse = CardDto;

// ------------------------------------------------------------
// PUT /cards/{card_id}/inbox  → 200
//   카드를 inbox 로 이동 (list_id 를 null 로).
//   ⚠️ inbox 로 가면 소속 리스트가 없으므로 라벨은 유지되나
//      "보드 상의 위치(sequence)"는 의미를 잃음. 서버에서 정리.
// ------------------------------------------------------------
export type MoveCardToInboxResponse = CardDto;   // Request body 없음

// ------------------------------------------------------------
// 카드 멤버 (담당자) — CardMembers
// ------------------------------------------------------------
// POST /cards/{card_id}/members  → 201
//   ⚠️ 지정하려는 user 가 해당 워크스페이스 멤버인지 검증 필요.
export interface AddCardMemberRequest {
  user_id: UUID;
}
export type AddCardMemberResponse = CardMemberDto;

// DELETE /cards/{card_id}/members/{user_id}  → 204 (body 없음)

// ------------------------------------------------------------
// 첨부파일 — Attachments
// ------------------------------------------------------------
// POST /cards/{card_id}/attachments  → 201
//   ⚠️ 실제 파일은 multipart/form-data 업로드.
//      서버가 스토리지에 올린 뒤 file_url 을 만든다.
//      → 아래는 "메타데이터 응답" 기준. Request 는 파일 바이너리라
//        JSON DTO 로 표현하지 않음(주석으로 명시).
export type AddAttachmentResponse = AttachmentDto;

// DELETE /cards/attachments/{attachment_id}  → 204 (body 없음)
//   ⚠️ 경로에 card_id 가 없음 → attachment_id 만으로 소유 카드/워크스페이스
//      권한을 역추적해서 검증해야 함.
