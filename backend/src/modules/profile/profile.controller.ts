import type { RequestHandler } from 'express'
import * as profileService from './profile.service'

interface ProfileParams {
  userId: string
}

export const getPublicProfile: RequestHandler<ProfileParams> = async (req, res) => {
  res.status(200).json(await profileService.getPublicProfile(req.params.userId))
}
