// ============================================================
// workspaces.dto.ts — Workspaces & Members
// ============================================================
import { UUID, ISODateString, Role } from './common.dto';

// ------------------------------------------------------------
// 공용: 워크스페이스 표현
// ------------------------------------------------------------
export interface WorkspaceDto {
  id: UUID;
  name: string;
  is_public: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** 멤버 표현 (WorkspaceMembers + Users 조인 결과) */
export interface WorkspaceMemberDto {
  user_id: UUID;
  name: string;
  email: string;                       // 멤버 관리 화면에서만 노출
  profile_image_url: string | null;
  role: Role;
}

// ------------------------------------------------------------
// GET /workspaces  → 200
//   내가 속한 워크스페이스 목록
// ------------------------------------------------------------
export type ListWorkspacesResponse = WorkspaceDto[];

// ------------------------------------------------------------
// POST /workspaces  → 201
//   ⚠️ 생성자는 자동으로 OWNER 로 WorkspaceMembers 에 추가되어야 한다.
//      (DBML 에 owner_id 컬럼이 없으므로 OWNER role 로 추적하는 구조)
//      이 처리는 서비스 계층 책임. DTO 에는 드러나지 않음.
// ------------------------------------------------------------
export interface CreateWorkspaceRequest {
  name: string;
  is_public?: boolean;   // 기본 false 권장 (안 보내면 비공개)
}
export type CreateWorkspaceResponse = WorkspaceDto;

// ------------------------------------------------------------
// GET /workspaces/{workspace_id}  → 200
//   상세. 멤버 목록까지 같이 줄지 결정 필요 → 여기선 포함시킴.
// ------------------------------------------------------------
export interface WorkspaceDetailResponse extends WorkspaceDto {
  members: WorkspaceMemberDto[];
}

// ------------------------------------------------------------
// PUT /workspaces/{workspace_id}  → 200
// ------------------------------------------------------------
export interface UpdateWorkspaceRequest {
  name?: string;
  is_public?: boolean;
}
export type UpdateWorkspaceResponse = WorkspaceDto;

// ------------------------------------------------------------
// DELETE /workspaces/{workspace_id}  → 204 (body 없음)
//   ⚠️ cascade 로 Lists, Cards, Labels 등 연쇄 삭제됨 (DBML FK 정책).
//      OWNER 만 가능하도록 권한 검증 필요.
// ------------------------------------------------------------

// ------------------------------------------------------------
// POST /workspaces/{workspace_id}/members  → 201
//   이메일로 멤버 초대.
//   ⚠️ 해당 이메일의 유저가 없을 수도 있음 → 서버에서 404 또는
//      "초대 보류" 처리 정책 필요.
// ------------------------------------------------------------
export interface InviteMemberRequest {
  email: string;
  role?: Role;   // 미지정 시 MEMBER 기본 권장
}
export type InviteMemberResponse = WorkspaceMemberDto;

// ------------------------------------------------------------
// PUT /workspaces/{workspace_id}/members/{user_id}  → 200
//   멤버 권한 변경.
//   ⚠️ OWNER 를 변경/강등할 때의 규칙(마지막 OWNER 보호)은 서비스에서 검증.
// ------------------------------------------------------------
export interface UpdateMemberRoleRequest {
  role: Role;
}
export type UpdateMemberRoleResponse = WorkspaceMemberDto;

// ------------------------------------------------------------
// DELETE /workspaces/{workspace_id}/members/{user_id}  → 204 (body 없음)
// ------------------------------------------------------------
