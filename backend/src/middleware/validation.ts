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
