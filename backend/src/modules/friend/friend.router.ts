import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import * as friendController from './friend.controller'

export const friendRouter = Router()

friendRouter.use(requireAuth)
friendRouter.get('/', friendController.list)
friendRouter.get('/requests', friendController.listRequests)
friendRouter.post('/requests', friendController.sendRequest)
friendRouter.post('/requests/:friendUserId/accept', friendController.acceptRequest)
friendRouter.delete('/requests/:friendUserId', friendController.deleteRequest)
friendRouter.delete('/:friendUserId', friendController.remove)
