import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../modules/auth/auth.service';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({
      status_code: 401,
      error: 'UNAUTHORIZED',
      message: 'A Bearer access token is required',
    });
    return;
  }

  try {
    const userId = verifyAccessToken(authorization.slice('Bearer '.length));
    req.auth = { userId };
    req.user = { id: userId };
    next();
  } catch {
    res.status(401).json({
      status_code: 401,
      error: 'INVALID_ACCESS_TOKEN',
      message: 'The access token is invalid or expired',
    });
  }
}
