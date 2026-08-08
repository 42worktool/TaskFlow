// 인증 모듈의 외부 진입점만 다시 내보내 상위 앱이 내부 파일 구조에 의존하지 않게 한다.
export { authRouter } from './auth.router'
export { googleCallback } from './auth.controller'
