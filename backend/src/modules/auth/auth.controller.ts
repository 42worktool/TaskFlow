import { CookieOptions, Request, Response } from 'express';
import { config } from '../../config';
import * as authService from './auth.service';

export const OAUTH_STATE_COOKIE = 'ft_oauth_state';
export const REFRESH_TOKEN_COOKIE = 'ft_refresh_token';

const oauthCookieBaseOptions: CookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/',
};

const oauthCookieOptions: CookieOptions = {
  ...oauthCookieBaseOptions,
  maxAge: config.oauthStateTtlSeconds * 1000,
};

const refreshCookieBaseOptions: CookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/api/auth',
};

const refreshCookieOptions: CookieOptions = {
  ...refreshCookieBaseOptions,
  maxAge: config.refreshTokenTtlSeconds * 1000,
};

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function oauthErrorRedirect(code: string): string {
  const url = new URL('/signin', config.appOrigin);
  url.searchParams.set('oauth_error', code.toLowerCase());
  return url.toString();
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof authService.AuthError) {
    res.status(error.statusCode).json({
      status_code: error.statusCode,
      error: error.code,
      message: error.message,
    });
    return;
  }

  console.error('[auth] request failed', error instanceof Error ? error.message : error);
  res.status(500).json({
    status_code: 500,
    error: 'AUTH_INTERNAL_ERROR',
    message: 'Authentication could not be completed',
  });
}

async function sendAuthenticatedUser(
  res: Response,
  user: authService.UserPublic,
  statusCode: number,
): Promise<void> {
  const session = await authService.createSession(user.id);
  res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshCookieOptions);
  res.set('Cache-Control', 'no-store');
  res.status(statusCode).json({
    user,
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: config.accessTokenTtlSeconds,
  });
}

export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const user = await authService.registerWithPassword({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password,
    });
    await sendAuthenticatedUser(res, user, 201);
  } catch (error) {
    sendError(res, error);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const user = await authService.authenticateWithPassword({
      email: req.body?.email,
      password: req.body?.password,
      clientKey: req.ip || req.socket.remoteAddress || 'unknown',
    });
    await sendAuthenticatedUser(res, user, 200);
  } catch (error) {
    sendError(res, error);
  }
}

export async function beginGoogle(req: Request, res: Response): Promise<void> {
  try {
    const { authorizationUrl, state } = await authService.beginGoogleOAuth(req.query.return_to);
    res.cookie(OAUTH_STATE_COOKIE, state, oauthCookieOptions);
    res.redirect(authorizationUrl);
  } catch (error) {
    sendError(res, error);
  }
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const providerError = queryString(req.query.error);
  if (providerError) {
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions);
    res.redirect(oauthErrorRedirect(providerError === 'access_denied' ? 'access_denied' : 'google_error'));
    return;
  }

  const code = queryString(req.query.code);
  const state = queryString(req.query.state);
  if (!code || !state) {
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions);
    res.redirect(oauthErrorRedirect('invalid_callback'));
    return;
  }

  try {
    const result = await authService.completeGoogleOAuth({
      code,
      state,
      stateCookie: req.cookies?.[OAUTH_STATE_COOKIE],
    });
    const session = await authService.createSession(result.user.id);

    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions);
    res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshCookieOptions);
    res.redirect(new URL(result.returnTo, config.appOrigin).toString());
  } catch (error) {
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions);
    const code = error instanceof authService.AuthError ? error.code : 'oauth_failed';
    if (!(error instanceof authService.AuthError)) {
      console.error('[auth] Google callback failed', error instanceof Error ? error.message : error);
    }
    res.redirect(oauthErrorRedirect(code));
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const currentToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (typeof currentToken !== 'string') {
    res.status(401).json({
      status_code: 401,
      error: 'MISSING_REFRESH_TOKEN',
      message: 'Refresh cookie is missing',
    });
    return;
  }

  try {
    const session = await authService.rotateSession(currentToken);
    res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshCookieOptions);
    res.json({
      access_token: session.accessToken,
      token_type: 'Bearer',
      expires_in: config.accessTokenTtlSeconds,
    });
  } catch (error) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieBaseOptions);
    sendError(res, error);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (typeof token === 'string') {
    try {
      await authService.revokeSession(token);
    } catch (error) {
      console.error('[auth] refresh session revoke failed', error instanceof Error ? error.message : error);
    }
  }
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieBaseOptions);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth) throw new authService.AuthError('UNAUTHORIZED', 401, 'Authentication required');
    res.json(await authService.getCurrentUser(req.auth.userId));
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateAccount(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth) throw new authService.AuthError('UNAUTHORIZED', 401, 'Authentication required');
    res.json(await authService.updateCurrentUser(req.auth.userId, req.body?.name));
  } catch (error) {
    sendError(res, error);
  }
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth) throw new authService.AuthError('UNAUTHORIZED', 401, 'Authentication required');
    await authService.deleteCurrentUser(req.auth.userId);
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieBaseOptions);
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
}
