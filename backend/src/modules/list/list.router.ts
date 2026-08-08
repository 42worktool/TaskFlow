// ============================================================
// list.router.ts — 리스트 CRUD와 하위 카드 생성 라우트 연결
// ============================================================
import { Router } from 'express'
import * as listCtrl from './list.controller'
import * as cardCtrl from '../card/card.controller'
import { uuidParam } from '../../middleware/validation'

export const listRouter = Router()
listRouter.param('list_id', uuidParam)

listRouter.get('/:list_id', listCtrl.getOne)
listRouter.put('/:list_id', listCtrl.update)
listRouter.delete('/:list_id', listCtrl.remove)
listRouter.put('/:list_id/order', listCtrl.reorder)
listRouter.post('/:list_id/cards', cardCtrl.create)
