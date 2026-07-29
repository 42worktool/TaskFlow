// ============================================================
// list.router.ts — mount list CRUD + nested card creation routes
// ============================================================
import { Router } from 'express'
import * as listCtrl from './list.controller'
import * as cardCtrl from '../card/card.controller'
import { requireAuth } from '../../middleware/auth'

export const listRouter = Router()

listRouter.get('/:list_id', requireAuth, listCtrl.getOne)
listRouter.put('/:list_id', requireAuth, listCtrl.update)
listRouter.delete('/:list_id', requireAuth, listCtrl.remove)
listRouter.put('/:list_id/order', requireAuth, listCtrl.reorder)
listRouter.post('/:list_id/cards', requireAuth, cardCtrl.create)
