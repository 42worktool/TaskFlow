// 레이블 ID 검증과 수정·삭제 컨트롤러를 레이블 경로에 연결한다.
import { Router } from 'express'
import * as ctrl from './label.controller'
import { uuidParam } from '../../middleware/validation'

export const labelRouter = Router()
labelRouter.param('label_id', uuidParam)
labelRouter.put('/:label_id', ctrl.update)
labelRouter.delete('/:label_id', ctrl.remove)
