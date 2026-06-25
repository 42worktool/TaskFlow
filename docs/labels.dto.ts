// ============================================================
// labels.dto.ts — Labels
// ============================================================
import { UUID, ISODateString } from './common.dto';

// ------------------------------------------------------------
// 공용: 라벨 표현
//   DBML Label: id, label_name, workspace_id, label_color, created_at, updated_at
//   ⚠️ 라벨은 "워크스페이스" 종속이다. 카드가 아니라 워크스페이스 소유.
//      → 카드를 다른 워크스페이스로 옮기면 라벨이 안 따라간다(설계상 주의점).
// ------------------------------------------------------------
export interface LabelDto {
  id: UUID;
  workspace_id: UUID;
  label_name: string;
  label_color: string;   // 예: "#FF5733" — 형식 검증 권장
  created_at: ISODateString;
}

// ------------------------------------------------------------
// GET /workspaces/{workspace_id}/labels  → 200
// ------------------------------------------------------------
export type ListLabelsResponse = LabelDto[];

// ------------------------------------------------------------
// POST /workspaces/{workspace_id}/labels  → 201
// ------------------------------------------------------------
export interface CreateLabelRequest {
  label_name: string;
  label_color: string;
}
export type CreateLabelResponse = LabelDto;

// ------------------------------------------------------------
// DELETE /labels/{label_id}  → 204 (body 없음)
//   ⚠️ cascade: CardLabel 연쇄 삭제 → 이 라벨이 붙은 모든 카드에서
//      자동으로 떨어진다. 의도된 동작인지 확인.
// ------------------------------------------------------------

// ------------------------------------------------------------
// POST /cards/{card_id}/labels  → 201
//   카드에 라벨 부착 (CardLabel 행 생성).
//   ⚠️ 부착하려는 라벨이 "카드가 속한 워크스페이스의 라벨"인지 검증.
//      다른 워크스페이스 라벨을 붙이면 안 됨.
// ------------------------------------------------------------
export interface AttachLabelRequest {
  label_id: UUID;
}
export type AttachLabelResponse = LabelDto;

// ------------------------------------------------------------
// DELETE /cards/{card_id}/labels/{label_id}  → 204 (body 없음)
//   CardLabel 행 1개 제거 (라벨 자체는 삭제되지 않음).
// ------------------------------------------------------------
