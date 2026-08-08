// backend/src/lib/upload.ts의 제한을 화면의 즉시 피드백 용도로 동일하게 둔다.
// 클라이언트 검사는 우회할 수 있으므로 실제 허용 여부는 서버의 재검증이 최종 기준이다.

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'text/plain',
  'video/mp4',
])

export const AVATAR_MAX_BYTES = 3 * 1024 * 1024
export const AVATAR_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
