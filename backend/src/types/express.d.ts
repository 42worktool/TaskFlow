import 'express'

// Express Request에 user 필드를 추가한다.
// 실제 인증 미들웨어가 req.user를 더 풍부한 객체로 채우게 되면
// 이 인터페이스를 확장한다 (id, name, email, ...).
declare module 'express' {
  interface Request {
    user?: { id: string }
  }
}
