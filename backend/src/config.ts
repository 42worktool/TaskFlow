// ============================================================
// config.ts — 앱全域 설정 상수
// ============================================================

// 개발용 고정 유저 ID. 시드(seed.ts)가 이 ID로 유저를 생성하며,
// 개발용 requireAuth 미들웨어가 이 ID를 req.user.id로 주입한다.
// 프로덕션에서는 절대 사용되지 않는다 (requireAuth가 IS_DEV에서 throw).
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001'

export const PORT = Number(process.env.PORT ?? 3000)

// NODE_ENV가 'production'이 아니면 개발 환경으로 간주.
// 개발용 미들웨어/엔드포인트는 이 플래그로 가드한다.
export const IS_DEV = process.env.NODE_ENV !== 'production'
