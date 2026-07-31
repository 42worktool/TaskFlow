import { Router } from 'express'
import { getDashboard } from './dashboard.controller'

export const dashboardRouter = Router({ mergeParams: true })

dashboardRouter.get('/', getDashboard)
