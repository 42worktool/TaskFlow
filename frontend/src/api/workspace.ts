import { api } from './client'
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
}
