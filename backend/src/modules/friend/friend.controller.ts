import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import * as friendService from './friend.service'
import { friendRequestSchema } from './friend.validation'

interface FriendUserParams {
  friendUserId: string
}

export const list: RequestHandler = async (req, res) => {
  const friends = await friendService.listFriends({
    userId: authenticatedUserId(req),
  })
  res.status(200).json(friends)
}

export const listRequests: RequestHandler = async (req, res) => {
  const requests = await friendService.listFriendRequests({
    userId: authenticatedUserId(req),
  })
  res.status(200).json(requests)
}

export const sendRequest: RequestHandler = async (req, res) => {
  const body = friendRequestSchema.parse(req.body)
  const request = await friendService.sendFriendRequest({
    userId: authenticatedUserId(req),
    email: body.email,
  })
  res.status(201).json(request)
}

export const sendRequestToUser: RequestHandler<FriendUserParams> = async (req, res) => {
  const request = await friendService.sendFriendRequestToUser({
    userId: authenticatedUserId(req),
    targetUserId: req.params.friendUserId,
  })
  res.status(201).json(request)
}

export const acceptRequest: RequestHandler<FriendUserParams> = async (req, res) => {
  const friend = await friendService.acceptFriendRequest({
    userId: authenticatedUserId(req),
    requesterUserId: req.params.friendUserId,
  })
  res.status(201).json(friend)
}

export const deleteRequest: RequestHandler<FriendUserParams> = async (req, res) => {
  await friendService.deleteFriendRequest({
    userId: authenticatedUserId(req),
    otherUserId: req.params.friendUserId,
  })
  res.status(204).send()
}

export const remove: RequestHandler<FriendUserParams> = async (req, res) => {
  await friendService.removeFriend({
    userId: authenticatedUserId(req),
    friendUserId: req.params.friendUserId,
  })
  res.status(204).send()
}
