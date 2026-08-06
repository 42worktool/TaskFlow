import type { RequestHandler } from 'express'
import * as profileService from './profile.service'
import { profileSearchQuerySchema } from './profile.validation'

interface ProfileParams {
  userId: string
}

export const getPublicProfile: RequestHandler<ProfileParams> = async (req, res) => {
  res.status(200).json(await profileService.getPublicProfile(req.params.userId))
}

export const searchPublicProfiles: RequestHandler = async (req, res) => {
  const { q, limit, workspace_id } = profileSearchQuerySchema.parse(req.query)
  res.status(200).json(
    await profileService.searchPublicProfiles({
      query: q,
      limit,
      workspaceId: workspace_id,
    }),
  )
}
