import jwt, { type JwtPayload } from 'jsonwebtoken'
import { config } from '../config'

export interface AccessTokenPrincipal {
  userId: string
  expiresAt: number
}

export function signAccessToken(userId: string): string {
  return jwt.sign({}, config.jwtAccessSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: config.accessTokenTtlSeconds,
  })
}

export function verifyAccessToken(token: string): AccessTokenPrincipal {
  const payload = jwt.verify(token, config.jwtAccessSecret, {
    algorithms: ['HS256'],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  }) as JwtPayload

  if (!payload.sub) throw new Error('Access token subject is missing')
  if (typeof payload.exp !== 'number') {
    throw new Error('Access token expiration is missing')
  }
  return {
    userId: payload.sub,
    expiresAt: payload.exp * 1_000,
  }
}
