// ============================================================
// card.router.ts — 카드, 레이블, 첨부 파일 라우트 연결
// ============================================================
import { Router } from 'express'
import * as ctrl from './card.controller'
import * as labelCtrl from '../label/label.controller'
import { uuidParam } from '../../middleware/validation'
import {
  ATTACHMENT_MIME_ALLOWLIST,
  attachmentUpload,
  requireMagicBytesMatch,
} from '../../lib/upload'

export const cardRouter = Router()
cardRouter.param('attachment_id', uuidParam)
cardRouter.param('card_id', uuidParam)
cardRouter.param('label_id', uuidParam)

// /:card_id 와일드카드가 구체적인 /inbox 경로를 가로채지 않도록 먼저 등록한다.
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
cardRouter.post(
  '/:card_id/attachments',
  attachmentUpload.single('file'),
  requireMagicBytesMatch('attachments', ATTACHMENT_MIME_ALLOWLIST),
  ctrl.addAttachment,
)
cardRouter.post('/:card_id/labels', labelCtrl.attach)
cardRouter.delete('/:card_id/labels/:label_id', labelCtrl.detach)
cardRouter.post('/:card_id/comments', ctrl.createComment)
