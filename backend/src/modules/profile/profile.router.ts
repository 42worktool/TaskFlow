import { Router } from 'express'
import { uuidParam } from '../../middleware/validation'
import * as profileController from './profile.controller'

export const profileRouter = Router()

profileRouter.param('userId', uuidParam)
profileRouter.get('/:userId/profile', profileController.getPublicProfile)
