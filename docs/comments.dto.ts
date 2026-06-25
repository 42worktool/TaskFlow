// ============================================================
// comments.dto.ts — Comments
// ============================================================
import { UUID, ISODateString } from './common.dto';

// ------------------------------------------------------------
// 공용: 댓글 표현
//   DBML Comment: id, card_id, user_id, comment_str, created_at, updated_at
//   작성자 정보를 같이 내려주기 위해 author 를 조인해서 포함.
// ------------------------------------------------------------
export interface CommentDto {
  id: UUID;
  card_id: UUID;
  author: {
    user_id: UUID;
    name: string;
    profile_image_url: string | null;
  };
  comment_str: string;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ------------------------------------------------------------
// POST /cards/{card_id}/comments  → 201
//   user_id 는 인증 토큰에서 추출. body 로 받지 않는다(위변조 방지).
// ------------------------------------------------------------
export interface CreateCommentRequest {
  comment_str: string;
}
export type CreateCommentResponse = CommentDto;

// ------------------------------------------------------------
// PATCH /comments/{comment_id}  → 200
//   ⚠️ 본인 댓글만 수정 가능 → user_id 일치 검증 필수.
// ------------------------------------------------------------
export interface UpdateCommentRequest {
  comment_str: string;
}
export type UpdateCommentResponse = CommentDto;

// ------------------------------------------------------------
// DELETE /comments/{comment_id}  → 204 (body 없음)
//   ⚠️ 본인 댓글 또는 워크스페이스 ADMIN/OWNER 만 삭제 가능(정책).
// ------------------------------------------------------------
