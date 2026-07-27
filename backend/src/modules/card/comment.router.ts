// ============================================================
// comment.router.ts — mount top-level comment routes
// ============================================================
import { Router } from 'express'
import * as ctrl from './card.controller'
import { requireAuth } from '../../middleware/auth'

export const commentRouter = Router()

commentRouter.patch('/:comment_id', requireAuth, ctrl.updateComment)
commentRouter.delete('/:comment_id', requireAuth, ctrl.deleteComment)
