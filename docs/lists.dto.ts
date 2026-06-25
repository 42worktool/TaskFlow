// ============================================================
// lists.dto.ts — Lists
// ============================================================
import { UUID } from './common.dto';

// ------------------------------------------------------------
// 공용: 리스트 표현
//   DBML Lists: id, workspace_id, name, sequence(float)
//   ⚠️ sequence 는 fractional indexing 용 float.
//      중간 삽입을 계속하면 정밀도 고갈로 두 리스트의 sequence 가
//      같아질 수 있음 → order 변경 응답에 항상 갱신된 sequence 를
//      내려주고, 주기적 재정규화(rebalancing) 로직 필요.
// ------------------------------------------------------------
export interface ListDto {
  id: UUID;
  workspace_id: UUID;
  name: string;
  sequence: number;
}

// ------------------------------------------------------------
// POST /workspaces/{workspace_id}/lists  → 201
//   workspace_id 는 URL 경로에서 받으므로 body 에 중복으로 안 받음.
// ------------------------------------------------------------
export interface CreateListRequest {
  name: string;
  // sequence 는 클라가 정하지 않음. 서버가 "맨 뒤"로 자동 계산.
}
export type CreateListResponse = ListDto;

// ------------------------------------------------------------
// PUT /lists/{list_id}  → 200
//   현재 변경 가능한 건 name 뿐.
// ------------------------------------------------------------
export interface UpdateListRequest {
  name: string;
}
export type UpdateListResponse = ListDto;

// ------------------------------------------------------------
// DELETE /lists/{list_id}  → 204 (body 없음)
//   ⚠️ Cards.list_id 는 [delete: set null] → 리스트 삭제 시 카드가
//      사라지지 않고 list_id 가 null(=inbox 상태)이 된다.
//      이게 의도인지 확인할 것. (의도면 OK)
// ------------------------------------------------------------

// ------------------------------------------------------------
// PUT /lists/{list_id}/order  → 200
//   리스트 순서 변경.
//   "앞/뒤 이웃 사이"로 끼워넣는 방식 → 이웃의 id 를 받아 서버가
//   사이값을 계산하는 패턴을 권장 (절대 sequence 값을 클라가 보내지 않음).
// ------------------------------------------------------------
export interface ReorderListRequest {
  before_list_id?: UUID | null;   // 이 리스트 "앞"에 둘 대상 (null = 맨 앞)
  after_list_id?: UUID | null;    // 이 리스트 "뒤"에 둘 대상 (null = 맨 뒤)
}
export type ReorderListResponse = ListDto;   // 갱신된 sequence 포함

// ------------------------------------------------------------
// ❌ PUT /lists/{list_id}/move (다른 보드로 이동) → 폐기됨
//    워크스페이스 간 이동 시 라벨(workspace 종속)/멤버 깨짐 문제로 제거.
// ------------------------------------------------------------
