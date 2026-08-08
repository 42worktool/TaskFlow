// 친구 요청, 친구 목록, 친구 간 DM 경로를 하나의 인증 하위 라우터로 조합한다.
import { Router } from 'express'
import { uuidParam } from '../../middleware/validation'
import * as friendController from './friend.controller'
import * as directMessageController from './direct-message.controller'

export const friendRouter = Router()

friendRouter.param('friendUserId', uuidParam)
friendRouter.get('/', friendController.list)
friendRouter.get('/requests', friendController.listRequests)
friendRouter.post('/requests', friendController.sendRequest)
friendRouter.post('/requests/:friendUserId', friendController.sendRequestToUser)
friendRouter.post('/requests/:friendUserId/accept', friendController.acceptRequest)
friendRouter.delete('/requests/:friendUserId', friendController.deleteRequest)
friendRouter.get('/:friendUserId/messages', directMessageController.list)
friendRouter.post('/:friendUserId/messages', directMessageController.create)
friendRouter.delete('/:friendUserId', friendController.remove)
