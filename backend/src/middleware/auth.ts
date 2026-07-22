import type { Request, Response, NextFunction } from 'express'
import { DEV_USER_ID, IS_DEV } from '../config'

// ============================================================
// Dev authentication middleware (temporary)
//
// Used only to verify workspace CRUD behavior until the auth owner
// ships the real implementation. Treats every request as DEV_USER.
//
// IS_DEV guard: if this middleware is loaded in production
// (NODE_ENV=production) it throws immediately, forcing the dev-only
// shim to never ship by accident. The auth owner replaces this
// entire file once real authentication is ready.
// ============================================================
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!IS_DEV) {
    throw new Error('dev requireAuth must not be loaded outside development')
  }
  req.user = { id: DEV_USER_ID }
  next()
}
