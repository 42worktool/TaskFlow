// Client-side mirrors of the limits enforced in backend/src/lib/upload.ts.
// These only improve UX (instant feedback before a round trip); the server
// re-validates independently and is the actual source of truth.

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_MIME_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'text/plain',
  'video/mp4',
])

export const AVATAR_MAX_BYTES = 3 * 1024 * 1024
export const AVATAR_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
