import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import { getDashboard } from './dashboard.controller'

export const dashboardRouter = Router({ mergeParams: true })

dashboardRouter.get('/', requireAuth, getDashboard)
