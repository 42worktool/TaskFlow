// 로그인 없이 접근 가능한 프로필 경로와 사용자 ID 검증을 조합한다.
import { Router } from 'express'
import { uuidParam } from '../../middleware/validation'
import * as profileController from './profile.controller'

export const profileRouter = Router()

profileRouter.param('userId', uuidParam)
profileRouter.get('/:userId/profile', profileController.getPublicProfile)
