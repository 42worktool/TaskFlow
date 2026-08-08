// 워크스페이스 하위 경로에 대시보드 조회 컨트롤러를 연결한다.
import { Router } from 'express'
import { getDashboard } from './dashboard.controller'

export const dashboardRouter = Router({ mergeParams: true })

dashboardRouter.get('/', getDashboard)
