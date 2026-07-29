import type { RequestHandler } from 'express'
import * as friendService from './friend.service'
import { friendRequestSchema, friendUserIdSchema } from './friend.validation'

export const list: RequestHandler = async (req, res) => {
  const friends = await friendService.listFriends({ userId: req.user!.id })
  res.status(200).json(friends)
}

export const listRequests: RequestHandler = async (req, res) => {
  const requests = await friendService.listFriendRequests({
    userId: req.user!.id,
  })
  res.status(200).json(requests)
}

export const sendRequest: RequestHandler = async (req, res) => {
  const body = friendRequestSchema.parse(req.body)
  const request = await friendService.sendFriendRequest({
    userId: req.user!.id,
    email: body.email,
  })
  res.status(201).json(request)
}

export const acceptRequest: RequestHandler = async (req, res) => {
  const requesterUserId = friendUserIdSchema.parse(req.params.friendUserId)
  const friend = await friendService.acceptFriendRequest({
    userId: req.user!.id,
    requesterUserId,
  })
  res.status(201).json(friend)
}

export const deleteRequest: RequestHandler = async (req, res) => {
  const otherUserId = friendUserIdSchema.parse(req.params.friendUserId)
  await friendService.deleteFriendRequest({
    userId: req.user!.id,
    otherUserId,
  })
  res.status(204).send()
}

export const remove: RequestHandler = async (req, res) => {
  const friendUserId = friendUserIdSchema.parse(req.params.friendUserId)
  await friendService.removeFriend({
    userId: req.user!.id,
    friendUserId,
  })
  res.status(204).send()
}
