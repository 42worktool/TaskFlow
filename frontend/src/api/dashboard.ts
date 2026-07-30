import { apiRequest } from '../services/auth'
import type { DashboardPeriod, WorkspaceDashboard } from '../types'

export const DashboardAPI = {
  get: (workspaceId: string, period: DashboardPeriod = 30) =>
    apiRequest<WorkspaceDashboard>(
      `/api/workspaces/${workspaceId}/dashboard?period=${period}`,
    ),
}
