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
