import { api } from './client'
import { authFetch } from '../services/auth'
import type { Workspace } from '../types'

export const WorkspaceAPI = {
  list: () =>
    api.get<{ my: Workspace[]; public: Workspace[] }>('/workspaces').then((r) => r.data),

  get: (id: string) => api.get<Workspace>(`/workspaces/${id}`).then((r) => r.data),

  create: (name: string, isPublic = false) =>
    api.post<Workspace>('/workspaces', { name, is_public: isPublic }).then((r) => r.data),

  update: (id: string, patch: { name?: string; is_public?: boolean }) =>
    api.put<Workspace>(`/workspaces/${id}`, patch).then((r) => r.data),

  remove: (id: string) => api.delete(`/workspaces/${id}`).then((r) => r.data),

  inviteMember: async (workspaceId: string, email: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') => {
    const response = await authFetch(`/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error || '초대를 보내지 못했습니다.')
    }
    return response.json() as Promise<{ ok: true }>
  },

  acceptInvite: async (token: string) => {
    const response = await authFetch(`/api/workspaces/invite/${token}`, {
      method: 'POST',
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error || '초대 수락에 실패했습니다.')
    }
    return response.json() as Promise<Workspace>
  },

  changeMemberRole: async (
    workspaceId: string,
    userId: string,
    role: 'ADMIN' | 'MEMBER' | 'VIEWER',
  ) => {
    const response = await authFetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error || '권한을 변경하지 못했습니다.')
    }
    return response.json() as Promise<Workspace>
  },

  removeMember: async (workspaceId: string, userId: string) => {
    const response = await authFetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error || '멤버를 제거하지 못했습니다.')
    }
    return response.json() as Promise<{ ok: true }>
  },
}
