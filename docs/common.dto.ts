// ============================================================
// common.dto.ts — 공용 타입 / 유틸리티 타입
// ============================================================
// 모든 DTO 파일이 여기서 import 한다.
// "이름만 정해두면 의미가 명확해지는" 별칭(alias)들을 모아둔다.
// ------------------------------------------------------------

/** UUID 문자열 (DBML의 uuid pk/fk 들) */
export type UUID = string;

/**
 * ISO-8601 날짜 문자열 (예: "2026-06-25T09:00:00.000Z")
 * ⚠️ JSON 에는 Date 타입이 없으므로 전송 시 항상 문자열이다.
 *    서버에서 Date 로 파싱하는 책임은 컨트롤러/서비스에 있다.
 */
export type ISODateString = string;

/** OAuth provider — 이 프로젝트는 구글만 사용 */
export type OAuthProvider = 'google';

/** 워크스페이스 멤버 권한 (DBML Enum Role) */
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

// ------------------------------------------------------------
// 공통 응답 형태
// ------------------------------------------------------------

/** 단순 메시지 응답 (비밀번호 변경 성공 등) */
export interface MessageResponse {
  message: string;
}

/** 에러 응답 (검증 실패, 권한 없음 등 공통 포맷) */
export interface ErrorResponse {
  status_code: number;
  error: string;     // 짧은 코드성 문자열 (예: "VALIDATION_ERROR")
  message: string;   // 사람이 읽을 설명
}

// ------------------------------------------------------------
// 페이지네이션 (목록 조회에서 선택적으로 사용)
// ------------------------------------------------------------

export interface PaginationQuery {
  limit?: number;    // 기본값은 서버에서 결정 (예: 20)
  cursor?: string;   // 커서 기반 페이지네이션 시
}

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;   // null 이면 마지막 페이지
}
