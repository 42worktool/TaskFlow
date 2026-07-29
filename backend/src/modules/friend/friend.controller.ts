import type { RequestHandler } from 'express'
import * as friendService from './friend.service'
import { addFriendSchema, friendUserIdSchema } from './friend.validation'

export const list: RequestHandler = async (req, res) => {
  const friends = await friendService.listFriends({ userId: req.user!.id })
  res.status(200).json(friends)
}

export const add: RequestHandler = async (req, res) => {
  const body = addFriendSchema.parse(req.body)
  const friend = await friendService.addFriend({
    userId: req.user!.id,
    email: body.email,
  })
  res.status(201).json(friend)
}

export const remove: RequestHandler = async (req, res) => {
  const friendUserId = friendUserIdSchema.parse(req.params.friendUserId)
  await friendService.removeFriend({
    userId: req.user!.id,
    friendUserId,
  })
  res.status(204).send()
}
