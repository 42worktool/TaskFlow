import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import * as cardController from './card.controller'

export const inboxRouter = Router()

inboxRouter.get('/', requireAuth, cardController.listInbox)
