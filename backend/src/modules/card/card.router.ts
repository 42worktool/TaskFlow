// ============================================================
// card.router.ts — mount card, member, and attachment routes
// ============================================================
import { Router } from 'express'
import * as ctrl from './card.controller'
import * as labelCtrl from '../label/label.controller'
import { uuidParam } from '../../middleware/validation'
import { attachmentUpload } from '../../lib/upload'

export const cardRouter = Router()
cardRouter.param('attachment_id', uuidParam)
cardRouter.param('card_id', uuidParam)
cardRouter.param('user_id', uuidParam)
cardRouter.param('label_id', uuidParam)

// More specific routes before the wildcard /:card_id
cardRouter.delete('/attachments/:attachment_id', ctrl.removeAttachment)
cardRouter.get('/attachments/:attachment_id/download', ctrl.downloadAttachment)

cardRouter.get('/:card_id', ctrl.getOne)
cardRouter.put('/:card_id', ctrl.update)
cardRouter.delete('/:card_id', ctrl.remove)
cardRouter.put('/:card_id/order', ctrl.reorder)
cardRouter.put('/:card_id/move', ctrl.move)
cardRouter.patch('/:card_id/dates', ctrl.updateDates)
cardRouter.patch('/:card_id/completion', ctrl.updateCompletion)
cardRouter.put('/:card_id/inbox', ctrl.moveToInbox)
cardRouter.post('/:card_id/members', ctrl.addMember)
cardRouter.delete('/:card_id/members/:user_id', ctrl.removeMember)
cardRouter.post('/:card_id/attachments', attachmentUpload.single('file'), ctrl.addAttachment)
cardRouter.post('/:card_id/labels', labelCtrl.attach)
cardRouter.delete('/:card_id/labels/:label_id', labelCtrl.detach)
cardRouter.post('/:card_id/attachments', ctrl.addAttachment)
cardRouter.post('/:card_id/comments', ctrl.createComment)
