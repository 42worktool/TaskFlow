// ============================================================
// auth.dto.ts — Auth & OAuth
// ============================================================
import { UUID, ISODateString, OAuthProvider, MessageResponse } from './common.dto';

// ------------------------------------------------------------
// 공용: 인증 응답에 실리는 "안전한" 유저 표현
// ⚠️ password_hash 는 절대 포함하지 않는다.
// ------------------------------------------------------------
export interface UserPublic {
  id: UUID;
  email: string;
  name: string;
  profile_image_url: string | null;   // DBML 상 null 가능
  created_at: ISODateString;
}

// ------------------------------------------------------------
// POST /auth/signup  → 201
// ------------------------------------------------------------
export interface SignupRequest {
  email: string;
  password: string;   // 평문 전송 → HTTPS 필수, 서버에서 해싱 후 password_hash 저장
  name: string;
}
export type SignupResponse = UserPublic;

// ------------------------------------------------------------
// POST /auth/login  → 200
// ------------------------------------------------------------
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;   // access token 만료 (초). 예: 900 (15분)
  user: UserPublic;
  // ⚠️ refresh_token 은 응답 body 에 넣지 않는다.
  //    → HttpOnly + Secure 쿠키로만 내려준다 (XSS 로부터 보호).
  //      JS 가 토큰에 접근 못 하게 하는 것이 핵심.
}

// ------------------------------------------------------------
// POST /auth/logout  → 204 No Content (body 없음)
//   서버: refresh token 무효화 + 쿠키 삭제
// ------------------------------------------------------------

// ------------------------------------------------------------
// POST /auth/refresh  → 200
//   refresh_token 은 HttpOnly 쿠키에서 읽는다 → Request body 없음.
//   따라서 RefreshRequest 인터페이스는 두지 않는다.
// ------------------------------------------------------------
export interface RefreshResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

// ------------------------------------------------------------
// GET /auth/me  → 200
// ------------------------------------------------------------
export type MeResponse = UserPublic;

// ------------------------------------------------------------
// PUT /auth/password  → 200 (MessageResponse)
// ------------------------------------------------------------
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}
export type ChangePasswordResponse = MessageResponse;

// ------------------------------------------------------------
// OAuth (Google 전용)
//   GET /auth/oauth/google             → 302 리다이렉트 (body 없음)
//                                         서버가 state 발급 후 구글로 리다이렉트
//   GET /auth/oauth/callback/google    → 콜백. code+state 검증 후
//                                         자체 JWT 발급 → LoginResponse 와 동일
//                                         (또는 프론트로 302 리다이렉트)
// ------------------------------------------------------------
export interface OAuthCallbackQuery {
  code: string;
  state: string;   // CSRF 방지 — 시작 시 발급한 state 와 반드시 대조
}
export type OAuthLoginResult = LoginResponse;

/** OAuth 계정 연결 정보 (필요 시 노출) — DBML OAuthAccounts */
export interface OAuthAccountDto {
  id: UUID;
  provider: OAuthProvider;   // 'google'
  provider_id: string;       // 구글이 부여한 sub
  created_at: ISODateString;
}
