// ============================================================
// workspace.router.ts — mount workspace CRUD routes
// ============================================================
import { Router } from 'express'
import * as ctrl from './workspace.controller'
import { requireAuth } from '../../middleware/auth'

export const workspaceRouter = Router()

workspaceRouter.get('/', requireAuth, ctrl.list)
workspaceRouter.post('/', requireAuth, ctrl.create)
workspaceRouter.get('/:workspaceId', requireAuth, ctrl.getOne)
workspaceRouter.put('/:workspaceId', requireAuth, ctrl.update)
workspaceRouter.delete('/:workspaceId', requireAuth, ctrl.remove)
