// ============================================================
// workspace.router.ts — mount workspace CRUD routes
// ============================================================
import { Router } from 'express'
import * as ctrl from './workspace.controller'
import * as listCtrl from '../list/list.controller'
import * as messageCtrl from './workspace-message.controller'
import { requireAuth } from '../../middleware/auth'

export const workspaceRouter = Router()

workspaceRouter.get('/', requireAuth, ctrl.list)
workspaceRouter.post('/', requireAuth, ctrl.create)
workspaceRouter.get('/:workspaceId', requireAuth, ctrl.getOne)
workspaceRouter.put('/:workspaceId', requireAuth, ctrl.update)
workspaceRouter.delete('/:workspaceId', requireAuth, ctrl.remove)
workspaceRouter.post('/:workspaceId/members', requireAuth, ctrl.inviteMember)
workspaceRouter.put('/:workspaceId/members/:userId', requireAuth, ctrl.changeMemberRole)
workspaceRouter.delete('/:workspaceId/members/:userId', requireAuth, ctrl.removeMember)
workspaceRouter.post('/invite/:token', requireAuth, ctrl.acceptInvite)
workspaceRouter.get('/:workspaceId/lists', requireAuth, listCtrl.list)
workspaceRouter.post('/:workspaceId/lists', requireAuth, listCtrl.create)
workspaceRouter.get('/:workspaceId/messages', requireAuth, messageCtrl.list)
workspaceRouter.post('/:workspaceId/messages', requireAuth, messageCtrl.create)
