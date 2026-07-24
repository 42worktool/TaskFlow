// ============================================================
// workspace.router.ts — mount workspace CRUD routes
// ============================================================
import { Router } from 'express'
import * as ctrl from './workspace.controller'
import { requireAuth } from '../../middleware/auth'
import { createSimpleRateLimiter } from '../../middleware/rateLimit'

export const workspaceRouter = Router()
const memberMutationRateLimit = createSimpleRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
})

workspaceRouter.get('/', requireAuth, ctrl.list)
workspaceRouter.post('/', requireAuth, ctrl.create)
workspaceRouter.get('/:workspaceId', requireAuth, ctrl.getOne)
workspaceRouter.put('/:workspaceId', requireAuth, ctrl.update)
workspaceRouter.delete('/:workspaceId', requireAuth, ctrl.remove)
workspaceRouter.post(
  '/:workspaceId/members',
  memberMutationRateLimit,
  requireAuth,
  ctrl.inviteMember,
)
workspaceRouter.put(
  '/:workspaceId/members/:userId',
  memberMutationRateLimit,
  requireAuth,
  ctrl.updateMemberRole,
)
workspaceRouter.delete(
  '/:workspaceId/members/:userId',
  memberMutationRateLimit,
  requireAuth,
  ctrl.removeMember,
)
