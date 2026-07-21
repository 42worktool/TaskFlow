// ============================================================
// config.ts — global app configuration constants
// ============================================================

// Fixed user ID for development. seed.ts creates a user with this ID and
// the dev requireAuth middleware injects it as req.user.id.
// Must never be used in production (requireAuth throws under IS_DEV).
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001'

export const PORT = Number(process.env.PORT ?? 3000)

// Anything other than NODE_ENV=production is treated as development.
// Dev-only middleware/endpoints are guarded by this flag.
export const IS_DEV = process.env.NODE_ENV !== 'production'
