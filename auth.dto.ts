// ============================================================
// auth.dto.ts — Auth & OAuth
// ============================================================
import { UUID, ISODateString, OAuthProvider } from './common.dto';

// ------------------------------------------------------------
// 공용: 인증 응답에 실리는 안전한 유저 표현
// ⚠️ password_hash 는 절대 포함하지 않는다.
// ------------------------------------------------------------
export interface UserPublic {
  id: UUID;
  email: string;
  name: string;
  profile_image_url: string | null;
  created_at: ISODateString;
}

// ------------------------------------------------------------
// POST /auth/signup
// ------------------------------------------------------------
export interface SignupRequest {
  email: string;
  password: string;   // 평문 전송 → HTTPS 필수, 서버에서 해싱 후 저장
  name: string;
}
export type SignupResponse = UserPublic; // 201

// ------------------------------------------------------------
// POST /auth/login
// ------------------------------------------------------------
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  access_token: string;
  refresh_token: string;   // HttpOnly 쿠키 전달 권장
  token_type: 'Bearer';
  expires_in: number;      // 초 단위 (예: 900)
  user: UserPublic;
}

// ------------------------------------------------------------
// POST /auth/logout   → 204 No Content (body 없음)
// ------------------------------------------------------------

// ------------------------------------------------------------
// POST /auth/refresh
// ------------------------------------------------------------
export interface RefreshRequest {
  refresh_token: string;   // 또는 HttpOnly 쿠키에서 추출 시 body 생략 가능
}
export interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

// ------------------------------------------------------------
// GET /auth/me
// ------------------------------------------------------------
export type MeResponse = UserPublic;

// ------------------------------------------------------------
// PUT /auth/password
// ------------------------------------------------------------
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}
// Response 200 → MessageResponse

// ------------------------------------------------------------
// OAuth
//   GET /auth/oauth/google        → 302 리다이렉트 (body 없음) → 302 리다이렉트
//   GET /auth/oauth/callback/*   → 검증 후 자체 JWT 발급, LoginResponse 와 동일 형태
//                                   또는 302 리다이렉트(#token=...)
// ------------------------------------------------------------
export interface OAuthCallbackQuery {
  code: string;
  state: string;   // CSRF 방지 — 시작 시 발급한 state 와 대조 필수
}
export type OAuthLoginResult = LoginResponse;

/** OAuth 계정 연결 정보 (필요 시 노출) */
export interface OAuthAccountDto {
  id: UUID;
  provider: OAuthProvider;
  provider_id: string;
  created_at: ISODateString;
}
