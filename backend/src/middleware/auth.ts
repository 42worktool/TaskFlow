import { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '../lib/access-token'
import { AppError } from '../errors'

export function authenticatedUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) {
    throw new AppError('UNAUTHORIZED', 401, 'Authentication required')
  }
  return req.user.id
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authorization = req.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    next(new AppError('UNAUTHORIZED', 401, 'A Bearer access token is required'))
    return
  }

  try {
    // 검증된 최소 식별자만 Request에 남겨 이후 서비스가 토큰 원문에 의존하지 않게 한다.
    const principal = verifyAccessToken(authorization.slice('Bearer '.length))
    req.user = { id: principal.userId }
    next()
  } catch {
    next(new AppError('INVALID_ACCESS_TOKEN', 401, 'The access token is invalid or expired'))
  }
}
