// ============================================================
// card.router.ts — mount card, member, and attachment routes
// ============================================================
import { Router } from 'express'
import * as ctrl from './card.controller'
import { requireAuth } from '../../middleware/auth'

export const cardRouter = Router()

// More specific routes before the wildcard /:card_id
cardRouter.delete('/attachments/:attachment_id', requireAuth, ctrl.removeAttachment)

cardRouter.get('/:card_id', requireAuth, ctrl.getOne)
cardRouter.put('/:card_id', requireAuth, ctrl.update)
cardRouter.delete('/:card_id', requireAuth, ctrl.remove)
cardRouter.put('/:card_id/order', requireAuth, ctrl.reorder)
cardRouter.put('/:card_id/move', requireAuth, ctrl.move)
cardRouter.patch('/:card_id/dates', requireAuth, ctrl.updateDates)
cardRouter.patch('/:card_id/completion', requireAuth, ctrl.updateCompletion)
cardRouter.put('/:card_id/inbox', requireAuth, ctrl.moveToInbox)
cardRouter.post('/:card_id/members', requireAuth, ctrl.addMember)
cardRouter.delete('/:card_id/members/:user_id', requireAuth, ctrl.removeMember)
cardRouter.post('/:card_id/attachments', requireAuth, ctrl.addAttachment)
cardRouter.post('/:card_id/comments', requireAuth, ctrl.createComment)
