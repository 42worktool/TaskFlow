import type { Workspace } from '../types'
import { apiRequest } from '../services/auth'

export const WorkspaceAPI = {
  list: () =>
    apiRequest<{ my: Workspace[]; public: Workspace[] }>('/api/workspaces'),

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

  inviteMember: async (workspaceId: string, email: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') =>
    apiRequest<{ ok: true }>(`/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      json: { email, role },
    }),

  acceptInvite: async (token: string) =>
    apiRequest<Workspace>(`/api/workspaces/invite/${token}`, {
      method: 'POST',
    }),

  removeMember: async (workspaceId: string, userId: string) =>
    apiRequest<{ ok: true }>(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    }),
}
