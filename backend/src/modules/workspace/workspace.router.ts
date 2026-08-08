// ============================================================
// workspace.router.ts — 워크스페이스와 하위 자원 라우트 연결
// ============================================================
import { Router } from 'express'
import * as ctrl from './workspace.controller'
import * as labelCtrl from '../label/label.controller'
import * as listCtrl from '../list/list.controller'
import * as messageCtrl from './workspace-message.controller'
import { uuidParam } from '../../middleware/validation'
import { dashboardRouter } from '../dashboard'

export const workspaceRouter = Router()
workspaceRouter.param('workspaceId', uuidParam)
workspaceRouter.param('userId', uuidParam)

workspaceRouter.use('/:workspaceId/dashboard', dashboardRouter)
workspaceRouter.get('/', ctrl.list)
workspaceRouter.post('/', ctrl.create)
workspaceRouter.get('/:workspaceId', ctrl.getOne)
workspaceRouter.put('/:workspaceId', ctrl.update)
workspaceRouter.delete('/:workspaceId', ctrl.remove)
workspaceRouter.post('/:workspaceId/members', ctrl.inviteMember)
workspaceRouter.put('/:workspaceId/ownership/:userId', ctrl.transferOwnership)
workspaceRouter.delete('/:workspaceId/membership', ctrl.leave)
workspaceRouter.put('/:workspaceId/members/:userId', ctrl.changeMemberRole)
workspaceRouter.delete('/:workspaceId/members/:userId', ctrl.removeMember)
workspaceRouter.get('/invite/:token', ctrl.previewInvite)
workspaceRouter.post('/invite/:token', ctrl.acceptInvite)
workspaceRouter.get('/:workspaceId/lists', listCtrl.list)
workspaceRouter.post('/:workspaceId/lists', listCtrl.create)
workspaceRouter.get('/:workspaceId/labels', labelCtrl.list)
workspaceRouter.post('/:workspaceId/labels', labelCtrl.create)
workspaceRouter.get('/:workspaceId/messages', messageCtrl.list)
workspaceRouter.post('/:workspaceId/messages', messageCtrl.create)
