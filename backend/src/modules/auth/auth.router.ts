import { NextFunction, Request, Response, Router } from 'express';
import { config } from '../../config';
import { AppError } from '../../errors';
import { requireAuth } from '../../middleware/auth';
import { AVATAR_MIME_ALLOWLIST, avatarUpload, requireMagicBytesMatch } from '../../lib/upload';
import * as controller from './auth.controller';

function requireSameOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (origin && origin !== config.appOrigin) {
    next(
      new AppError(
        'INVALID_ORIGIN',
        403,
        'The request origin is not allowed',
      ),
    );
    return;
  }
  next();
}

export const authRouter = Router();

authRouter.post('/signup', requireSameOrigin, controller.signup);
authRouter.post('/login', requireSameOrigin, controller.login);
authRouter.get('/oauth/google', controller.beginGoogle);
authRouter.get('/oauth/callback/google', controller.googleCallback);
authRouter.post('/refresh', requireSameOrigin, controller.refresh);
authRouter.post('/logout', requireSameOrigin, controller.logout);
authRouter.get('/me', requireAuth, controller.me);
authRouter.patch('/account', requireSameOrigin, requireAuth, controller.updateAccount);
authRouter.delete('/account', requireSameOrigin, requireAuth, controller.deleteAccount);
authRouter.post(
  '/account/avatar',
  requireSameOrigin,
  requireAuth,
  avatarUpload.single('file'),
  requireMagicBytesMatch('avatars', AVATAR_MIME_ALLOWLIST),
  controller.uploadAvatar,
);
authRouter.delete('/account/avatar', requireSameOrigin, requireAuth, controller.removeAvatar);
