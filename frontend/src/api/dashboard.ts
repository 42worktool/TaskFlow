// 선택 기간에 맞춘 워크스페이스 활동 집계를 대시보드 화면에 제공한다.
import { apiRequest } from '../services/auth'
import type { DashboardPeriod, WorkspaceDashboard } from '../types'

export const DashboardAPI = {
  get: (workspaceId: string, period: DashboardPeriod = 30) =>
    apiRequest<WorkspaceDashboard>(`/api/workspaces/${workspaceId}/dashboard?period=${period}`),
}
