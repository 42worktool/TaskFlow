import type { Workspace, WorkspaceRole } from '../types'
import { apiRequest } from '../services/auth'

type ManageableWorkspaceRole = Exclude<WorkspaceRole, 'OWNER'>

export interface WorkspaceInvitationPreview {
  workspace_name: string
  role: ManageableWorkspaceRole
  already_member: boolean
  current_role?: WorkspaceRole
}

export const WorkspaceAPI = {
  list: () =>
    apiRequest<{ my: Workspace[]; public: Workspace[] }>('/api/workspaces'),

  get: (id: string) =>
    apiRequest<Workspace>(`/api/workspaces/${id}`),

  create: (name: string, isPublic = false) =>
    apiRequest<Workspace>('/api/workspaces', {
      method: 'POST',
      json: { name, is_public: isPublic },
    }),

  update: (id: string, patch: { name?: string; is_public?: boolean }) =>
    apiRequest<Workspace>(`/api/workspaces/${id}`, {
      method: 'PUT',
      json: patch,
    }),

  remove: (id: string) =>
    apiRequest<{ ok: true }>(`/api/workspaces/${id}`, { method: 'DELETE' }),

  inviteMember: async (workspaceId: string, email: string, role: ManageableWorkspaceRole) =>
    apiRequest<{ ok: true }>(`/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      json: { email, role },
    }),

  changeMemberRole: async (
    workspaceId: string,
    userId: string,
    role: ManageableWorkspaceRole,
  ) =>
    apiRequest<Workspace>(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      json: { role },
    }),

  acceptInvite: async (token: string) =>
    apiRequest<Workspace>(`/api/workspaces/invite/${token}`, {
      method: 'POST',
    }),

  previewInvite: async (token: string) =>
    apiRequest<WorkspaceInvitationPreview>(`/api/workspaces/invite/${token}`),

  removeMember: async (workspaceId: string, userId: string) =>
    apiRequest<{ ok: true }>(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    }),
}
