// 개인 인박스 조회 라우트를 워크스페이스 카드 라우트와 분리해 소유권 경계를 드러낸다.
import { Router } from 'express'
import * as cardController from './card.controller'

export const inboxRouter = Router()

inboxRouter.get('/', cardController.listInbox)
