import type { RequestHandler } from 'express'
import {
  createDirectMessage,
  listDirectMessages,
} from './direct-message.service'
import { createDirectMessageSchema } from './direct-message.validation'
import { friendUserIdSchema } from './friend.validation'

export const list: RequestHandler = async (req, res) => {
  const friendUserId = friendUserIdSchema.parse(req.params.friendUserId)
  const messages = await listDirectMessages({
    userId: req.user!.id,
    friendUserId,
  })
  res.status(200).json(messages)
}

export const create: RequestHandler = async (req, res) => {
  const friendUserId = friendUserIdSchema.parse(req.params.friendUserId)
  const body = createDirectMessageSchema.parse(req.body)
  const message = await createDirectMessage({
    userId: req.user!.id,
    friendUserId,
    content: body.content,
  })
  res.status(201).json(message)
}
