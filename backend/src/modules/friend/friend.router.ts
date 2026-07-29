import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import * as friendController from './friend.controller'

export const friendRouter = Router()

friendRouter.use(requireAuth)
friendRouter.get('/', friendController.list)
friendRouter.post('/', friendController.add)
friendRouter.delete('/:friendUserId', friendController.remove)
