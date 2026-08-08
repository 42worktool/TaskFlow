// ============================================================
// comment.router.ts — 최상위 댓글 라우트 연결
// ============================================================
import { Router } from 'express'
import * as ctrl from './card.controller'
import { uuidParam } from '../../middleware/validation'

export const commentRouter = Router()
commentRouter.param('comment_id', uuidParam)

commentRouter.patch('/:comment_id', ctrl.updateComment)
commentRouter.delete('/:comment_id', ctrl.deleteComment)
