// ============================================================
// Current Workspaces & Members HTTP contract
// ============================================================
import { UUID, ISODateString, Role } from './common.dto';

export interface WorkspaceMemberDto {
  user_id: UUID;
  role: Role;
  user: {
    id: UUID;
    name: string;
    /**
     * Included for workspace members and management responses.
     * Omitted when an authenticated non-member reads a public workspace.
     */
    email?: string;
    profile_image_url: string | null;
  };
}

export interface WorkspaceDto {
  id: UUID;
  name: string;
  is_public: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
  members: WorkspaceMemberDto[];
}

// GET /api/workspaces -> 200
// `my` includes private and public workspaces the caller has joined.
// `public` contains public workspaces the caller has not joined.
export interface ListWorkspacesResponse {
  my: WorkspaceDto[];
  public: WorkspaceDto[];
}

// POST /api/workspaces -> 201
// The creator becomes OWNER in the same transaction.
export interface CreateWorkspaceRequest {
  name: string;
  is_public?: boolean;
}
export type CreateWorkspaceResponse = WorkspaceDto;

// GET /api/workspaces/{workspace_id} -> 200
// Members can read private workspaces. Authenticated non-members can read
// public workspaces, but nested member email addresses are omitted.
export type GetWorkspaceResponse = WorkspaceDto;

// PUT /api/workspaces/{workspace_id} -> 200, ADMIN+
// At least one field is required; both fields may be sent together.
export type UpdateWorkspaceRequest =
  | { name: string; is_public?: boolean }
  | { name?: never; is_public: boolean };
export type UpdateWorkspaceResponse = WorkspaceDto;

// DELETE /api/workspaces/{workspace_id} -> 200, OWNER
export interface DeleteWorkspaceResponse {
  ok: true;
}

// POST /api/workspaces/{workspace_id}/members -> 201, ADMIN+
// Sends an expiring invitation email; it does not add the member immediately.
export interface InviteMemberRequest {
  email: string;
  role: Exclude<Role, 'OWNER'>;
}
export interface InviteMemberResponse {
  ok: true;
}

// POST /api/workspaces/invite/{token} -> 200
// The authenticated user's normalized email must match the invitation email.
export type AcceptInviteResponse = WorkspaceDto;

// PUT /api/workspaces/{workspace_id}/members/{user_id} -> 200, ADMIN+
// The target must not be an OWNER. Ownership transfer is a separate workflow.
// OWNER and ADMIN can manage ADMIN, MEMBER, and VIEWER memberships.
export interface UpdateMemberRoleRequest {
  role: Exclude<Role, 'OWNER'>;
}
export type UpdateMemberRoleResponse = WorkspaceDto;

// DELETE /api/workspaces/{workspace_id}/members/{user_id} -> 200, ADMIN+
// The final OWNER cannot be removed.
export interface RemoveMemberResponse {
  ok: true;
}
