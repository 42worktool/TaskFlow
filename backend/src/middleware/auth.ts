import type { Request, Response, NextFunction } from 'express'
import { DEV_USER_ID, IS_DEV } from '../config'

// ============================================================
// 개발용 인증 미들웨어 (임시)
//
// auth 담당자가 실제 인증을 완성하기 전까지 workspace CRUD 동작
// 확인용으로만 사용한다. 모든 요청을 DEV_USER로 간주한다.
//
// IS_DEV 가드: 프로덕션(NODE_ENV=production)에서 이 미들웨어가
// 로드되면 즉시 에러를 던져 실수로 배포되는 것을 강제로 막는다.
// auth 담당자가 완성하면 이 파일 전체를 교체한다.
// ============================================================
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!IS_DEV) {
    throw new Error('dev requireAuth must not be loaded outside development')
  }
  req.user = { id: DEV_USER_ID }
  next()
}
