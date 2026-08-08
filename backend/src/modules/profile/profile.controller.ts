// URL의 사용자 ID를 공개 프로필 조회 서비스로 전달하는 얇은 HTTP 어댑터다.
import type { RequestHandler } from 'express'
import * as profileService from './profile.service'

interface ProfileParams {
  userId: string
}

export const getPublicProfile: RequestHandler<ProfileParams> = async (req, res) => {
  res.status(200).json(await profileService.getPublicProfile(req.params.userId))
}
