import { Router } from 'express'
import * as cardController from './card.controller'

export const inboxRouter = Router()

inboxRouter.get('/', cardController.listInbox)
