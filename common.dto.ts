// ============================================================
// common.dto.ts — 공통 타입 정의
// ============================================================

/** 워크스페이스 멤버 역할 */
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

/** OAuth 제공자 */
export type OAuthProvider = 'google'

/** ISO 8601 형식의 타임스탬프 문자열 (예: "2026-06-23T10:00:00Z") */
export type ISODateString = string;

/** UUID 문자열 */
export type UUID = string;

// ------------------------------------------------------------
// 공통 응답 래퍼
// ------------------------------------------------------------

/**
 * 에러 응답 포맷 (전 엔드포인트 공통)
 * code: 프론트 분기용 식별자 / message: 사용자 표시용
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * 목록 응답 공통 래퍼.
 * 배열을 최상위로 반환하지 않고 항상 객체로 감싼다(페이지네이션 확장 대비).
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
}

/** 단순 메시지 응답 (예: 순서 변경 성공) */
export interface MessageResponse {
  message: string;
}
