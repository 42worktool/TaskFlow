import jwt, { type JwtPayload } from 'jsonwebtoken'
import { config } from '../config'

export interface AccessTokenPrincipal {
  userId: string
  expiresAt: number
}

export function signAccessToken(userId: string): string {
  // issuer/audience/알고리즘을 명시해 다른 용도의 JWT가 API 토큰으로 재사용되지 않게 한다.
  return jwt.sign({}, config.jwtAccessSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: config.accessTokenTtlSeconds,
  })
}

export function verifyAccessToken(token: string): AccessTokenPrincipal {
  // HTTP와 WebSocket이 동일한 검증 함수를 사용해 인증 기준이 갈라지지 않게 한다.
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
