// ============================================================
// workspace.dto.ts — Users & Workspaces & Members
// ============================================================
import { UUID, ISODateString, Role } from './common.dto';

// ------------------------------------------------------------
// PUT /users/{user_id}/profile
//   multipart/form-data 권장 (이미지 업로드)
//   ⚠️ URL 의 user_id 가 토큰 유저와 일치하는지 검증 (IDOR 방지)
// ------------------------------------------------------------
export interface UpdateProfileRequest {
  name?: string;
  profile_image_url?: string;
}
export interface UpdateProfileResponse {
  id: UUID;
  name: string;
  profile_image_url: string | null;
  updated_at: ISODateString;
}

// ------------------------------------------------------------
// 워크스페이스 멤버 표현
// ------------------------------------------------------------
export interface WorkspaceMemberDto {
  user_id: UUID;
  name: string;
  role: Role;
}

// ------------------------------------------------------------
// GET /workspaces  (목록)
// ------------------------------------------------------------
export interface WorkspaceSummary {
  id: UUID;
  name: string;
  is_public: boolean;
  my_role: Role;        // 현재 유저 기준 역할
  member_count: number;
}
export interface WorkspaceListResponse {
  workspaces: WorkspaceSummary[];
}

// ------------------------------------------------------------
// POST /workspaces
// ------------------------------------------------------------
export interface CreateWorkspaceRequest {
  name: string;
  is_public: boolean;
}
export interface CreateWorkspaceResponse {
  id: UUID;
  name: string;
  is_public: boolean;
  created_at: ISODateString;
  my_role: Role;        // 생성자는 자동 OWNER
}

// ------------------------------------------------------------
// GET /workspaces/{workspace_id}   ★ 메인 조회 (lists + cards nested)
//   ⚠️ N+1 주의: list_id IN (...), card_id IN (...) 으로 일괄 조회 후 Map 으로 묶기
//   ⚠️ 인박스 카드(list_id=NULL)는 리스트 JOIN 에서 자연 제외됨
// ------------------------------------------------------------
export interface CardMemberBrief {
  user_id: UUID;
  name: string;
}
export interface CardLabelBrief {
  id: UUID;
  label_name: string;
  color?: string;       // ⚠️ Label.color 스키마 추가 전제
}
export interface CardInList {
  id: UUID;
  title: string;
  sequence: number;
  deadline: ISODateString | null;
  members: CardMemberBrief[];
  labels: CardLabelBrief[];
}
export interface ListWithCards {
  id: UUID;
  name: string;
  sequence: number;
  cards: CardInList[];
}
export interface WorkspaceDetailResponse {
  id: UUID;
  name: string;
  is_public: boolean;
  my_role: Role;
  members: WorkspaceMemberDto[];
  lists: ListWithCards[];
}

// ------------------------------------------------------------
// PUT /workspaces/{workspace_id}
// ------------------------------------------------------------
export interface UpdateWorkspaceRequest {
  name?: string;
  is_public?: boolean;
}
export interface UpdateWorkspaceResponse {
  id: UUID;
  name: string;
  is_public: boolean;
  updated_at: ISODateString;
}

// DELETE /workspaces/{workspace_id} → 204 (OWNER 만, 하위 CASCADE)

// ------------------------------------------------------------
// Members
// ------------------------------------------------------------
// POST /workspaces/{workspace_id}/members
export interface InviteMemberRequest {
  email: string;
  role: Role;
}
export interface InviteMemberResponse {
  workspace_id: UUID;
  user_id: UUID;
  role: Role;
}

// PUT /workspaces/{workspace_id}/members/{user_id}
//   ⚠️ 마지막 OWNER 강등/제거 차단 로직 필수
export interface UpdateMemberRoleRequest {
  role: Role;
}
export interface UpdateMemberRoleResponse {
  workspace_id: UUID;
  user_id: UUID;
  role: Role;
}

// DELETE /workspaces/{workspace_id}/members/{user_id} → 204
