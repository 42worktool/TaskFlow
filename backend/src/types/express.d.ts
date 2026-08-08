// 인증 미들웨어가 주입하는 최소 사용자 식별자를 Express Request 타입에 확장한다.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
      }
    }
  }
}

export {}
