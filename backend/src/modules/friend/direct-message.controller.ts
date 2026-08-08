// 친구 ID와 메시지 입력을 파싱해 DM 서비스로 전달하고 HTTP 응답으로 변환한다.
import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import { createDirectMessage, listDirectMessages } from './direct-message.service'
import { createDirectMessageSchema } from './direct-message.validation'

interface FriendUserParams {
  friendUserId: string
}

export const list: RequestHandler<FriendUserParams> = async (req, res) => {
  const messages = await listDirectMessages({
    userId: authenticatedUserId(req),
    friendUserId: req.params.friendUserId,
  })
  res.status(200).json(messages)
}

export const create: RequestHandler<FriendUserParams> = async (req, res) => {
  const body = createDirectMessageSchema.parse(req.body)
  const message = await createDirectMessage({
    userId: authenticatedUserId(req),
    friendUserId: req.params.friendUserId,
    content: body.content,
  })
  res.status(201).json(message)
}
