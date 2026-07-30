import type { RequestHandler } from 'express'
import {
  dashboardParamsSchema,
  dashboardQuerySchema,
} from './dashboard.validation'
import { getWorkspaceDashboard } from './dashboard.service'

export const getDashboard: RequestHandler = async (req, res) => {
  const { workspaceId } = dashboardParamsSchema.parse(req.params)
  const { period } = dashboardQuerySchema.parse(req.query)
  const dashboard = await getWorkspaceDashboard({
    userId: req.user!.id,
    workspaceId,
    periodDays: period,
  })
  res.status(200).json(dashboard)
}
