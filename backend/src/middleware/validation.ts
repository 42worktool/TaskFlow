// 라우트 파라미터를 컨트롤러 진입 전에 검증해 잘못된 UUID가 서비스까지 전달되지 않게 한다.
import type { RequestParamHandler } from 'express'
import { uuidSchema } from '../lib/validation'

export const uuidParam: RequestParamHandler = (req, _res, next, value, name) => {
  const result = uuidSchema.safeParse(value)
  if (!result.success) {
    next(result.error)
    return
  }

  req.params[name] = result.data
  next()
}
