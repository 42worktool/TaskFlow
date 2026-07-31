// ============================================================
// comment.router.ts — mount top-level comment routes
// ============================================================
import { Router } from 'express'
import * as ctrl from './card.controller'
import { uuidParam } from '../../middleware/validation'

export const commentRouter = Router()
commentRouter.param('comment_id', uuidParam)

commentRouter.patch('/:comment_id', ctrl.updateComment)
commentRouter.delete('/:comment_id', ctrl.deleteComment)
