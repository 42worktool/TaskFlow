import { Router } from 'express'
import * as ctrl from './label.controller'
import { uuidParam } from '../../middleware/validation'

export const labelRouter = Router()
labelRouter.param('label_id', uuidParam)
labelRouter.delete('/:label_id', ctrl.remove)
