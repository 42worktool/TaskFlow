import type { CookieOptions, RequestHandler, Response } from 'express'
import { config } from '../../config'
import { AppError, BadRequestError } from '../../errors'
import { authenticatedUserId } from '../../middleware/auth'
import { withUploadCleanup } from '../../lib/upload'
import * as authService from './auth.service'
import { updateAccountSchema } from './auth.validation'

const OAUTH_STATE_COOKIE = 'ft_oauth_state'
const REFRESH_TOKEN_COOKIE = 'ft_refresh_token'

// refresh token은 JavaScript에서 읽지 못하는 쿠키에만 두고,
// 짧게 유지되는 access token만 응답 본문으로 전달한다.
const oauthCookieBaseOptions: CookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/',
}

const oauthCookieOptions: CookieOptions = {
  ...oauthCookieBaseOptions,
  maxAge: config.oauthStateTtlSeconds * 1000,
}

const refreshCookieBaseOptions: CookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/api/auth',
}

const refreshCookieOptions: CookieOptions = {
  ...refreshCookieBaseOptions,
  maxAge: config.refreshTokenTtlSeconds * 1000,
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function oauthErrorRedirect(code: string): string {
  const url = new URL('/signin', config.appOrigin)
  url.searchParams.set('oauth_error', code.toLowerCase())
  return url.toString()
}

async function sendAuthenticatedUser(
  res: Response,
  user: authService.UserPublic,
  statusCode: number,
): Promise<void> {
  const session = await authService.createSession(user.id)
  res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshCookieOptions)
  // 토큰이 포함된 인증 응답을 브라우저나 중간 프록시가 캐시하지 않게 한다.
  res.set('Cache-Control', 'no-store')
  res.status(statusCode).json({
    user,
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: config.accessTokenTtlSeconds,
  })
}

export const signup: RequestHandler = async (req, res) => {
  const user = await authService.registerWithPassword({
    name: req.body?.name,
    email: req.body?.email,
    password: req.body?.password,
    clientIp: req.ip || req.socket.remoteAddress || 'unknown',
  })
  await sendAuthenticatedUser(res, user, 201)
}

export const login: RequestHandler = async (req, res) => {
  const user = await authService.authenticateWithPassword({
    email: req.body?.email,
    password: req.body?.password,
    clientKey: req.ip || req.socket.remoteAddress || 'unknown',
  })
  await sendAuthenticatedUser(res, user, 200)
}

export const beginGoogle: RequestHandler = async (req, res) => {
  const { authorizationUrl, state } = await authService.beginGoogleOAuth(req.query.return_to)
  res.cookie(OAUTH_STATE_COOKIE, state, oauthCookieOptions)
  res.redirect(authorizationUrl)
}

export const googleCallback: RequestHandler = async (req, res) => {
  // OAuth 콜백은 브라우저 리디렉션 흐름이므로 JSON 오류 대신 안전한 로그인 URL로 돌려보낸다.
  const providerError = queryString(req.query.error)
  if (providerError) {
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions)
    res.redirect(
      oauthErrorRedirect(providerError === 'access_denied' ? 'access_denied' : 'google_error'),
    )
    return
  }

  const code = queryString(req.query.code)
  const state = queryString(req.query.state)
  if (!code || !state) {
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions)
    res.redirect(oauthErrorRedirect('invalid_callback'))
    return
  }

  try {
    const result = await authService.completeGoogleOAuth({
      code,
      state,
      stateCookie: req.cookies?.[OAUTH_STATE_COOKIE],
    })
    const session = await authService.createSession(result.user.id)

    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions)
    res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshCookieOptions)
    res.redirect(new URL(result.returnTo, config.appOrigin).toString())
  } catch (error) {
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieBaseOptions)
    const code = error instanceof AppError ? error.code : 'oauth_failed'
    if (!(error instanceof AppError)) {
      console.error('[auth] Google callback failed', error instanceof Error ? error.message : error)
    }
    res.redirect(oauthErrorRedirect(code))
  }
}

export const refresh: RequestHandler = async (req, res, next) => {
  const currentToken = req.cookies?.[REFRESH_TOKEN_COOKIE]
  if (typeof currentToken !== 'string') {
    res.status(204).send()
    return
  }

  try {
    const session = await authService.rotateSession(currentToken)
    res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshCookieOptions)
    res.json({
      user: session.user,
      access_token: session.accessToken,
      token_type: 'Bearer',
      expires_in: config.accessTokenTtlSeconds,
    })
  } catch (error) {
    // 회전에 실패한 쿠키를 남겨 무한 재시도하지 않도록 브라우저에서도 즉시 제거한다.
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieBaseOptions)
    next(error)
  }
}

export const logout: RequestHandler = async (req, res) => {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE]
  if (typeof token === 'string') {
    try {
      await authService.revokeSession(token)
    } catch (error) {
      // Redis 장애가 있더라도 클라이언트 쿠키 삭제는 완료해 사용자가 로그아웃할 수 있게 한다.
      console.error(
        '[auth] refresh session revoke failed',
        error instanceof Error ? error.message : error,
      )
    }
  }
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieBaseOptions)
  res.status(204).send()
}

export const me: RequestHandler = async (req, res) => {
  res.json(await authService.getCurrentUser(authenticatedUserId(req)))
}

export const updateAccount: RequestHandler = async (req, res) => {
  const profile = updateAccountSchema.parse(req.body)
  res.json(
    await authService.updateCurrentUser(authenticatedUserId(req), {
      ...(profile.name !== undefined ? { name: profile.name } : {}),
      ...(profile.headline !== undefined ? { headline: profile.headline } : {}),
      ...(profile.linkedin_url !== undefined ? { linkedinUrl: profile.linkedin_url } : {}),
    }),
  )
}

export const deleteAccount: RequestHandler = async (req, res) => {
  await authService.deleteCurrentUser(authenticatedUserId(req))
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieBaseOptions)
  res.status(204).send()
}

export const uploadAvatar: RequestHandler = async (req, res) => {
  if (!req.file) throw new BadRequestError('avatar file is required')
  const user = await withUploadCleanup('avatars', req.file, () =>
    authService.updateAvatar(authenticatedUserId(req), req.file!),
  )
  res.json(user)
}

export const removeAvatar: RequestHandler = async (req, res) => {
  res.json(await authService.removeAvatar(authenticatedUserId(req)))
}
