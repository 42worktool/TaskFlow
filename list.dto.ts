// ============================================================
// list.dto.ts — Lists
// ============================================================
import { UUID } from './common.dto';

// ------------------------------------------------------------
// POST /workspaces/{workspace_id}/lists
//   sequence 는 서버가 마지막+1 로 자동 부여
// ------------------------------------------------------------
export interface CreateListRequest {
  name: string;
}
export interface ListDto {
  id: UUID;
  workspace_id: UUID;
  name: string;
  sequence: number;
}
export type CreateListResponse = ListDto; // 201

// ------------------------------------------------------------
// PUT /lists/{list_id}
// ------------------------------------------------------------
export interface UpdateListRequest {
  name: string;
}
export interface UpdateListResponse {
  id: UUID;
  name: string;
  sequence: number;
}

// DELETE /lists/{list_id} → 204
//   ⚠️ 하위 카드 처리 정책: CASCADE 삭제 vs 인박스 이동 — 결정 필요

// ------------------------------------------------------------
// PUT /lists/{list_id}/order
//   권장: 전체 순서 배열 전달 (꼬임 방지)
//   ⚠️ sequence 정수 재정렬 대신 fractional index / LexoRank 고려
// ------------------------------------------------------------
export interface ReorderListRequest {
  ordered_list_ids: UUID[];
}
// Response 200 → MessageResponse
