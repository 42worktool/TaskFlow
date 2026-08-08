// 대시보드 쿼리와 사용자 식별자를 파싱해 집계 서비스로 전달하는 HTTP 어댑터다.
import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import { dashboardQuerySchema } from './dashboard.validation'
import { getWorkspaceDashboard } from './dashboard.service'

interface DashboardParams {
  workspaceId: string
}

export const getDashboard: RequestHandler<DashboardParams> = async (req, res) => {
  const { period } = dashboardQuerySchema.parse(req.query)
  const dashboard = await getWorkspaceDashboard({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId,
    periodDays: period,
  })
  res.status(200).json(dashboard)
}
