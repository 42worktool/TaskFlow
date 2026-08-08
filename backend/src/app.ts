import path from 'node:path'
import cookieParser from 'cookie-parser'
import express from 'express'
import { authRouter, googleCallback } from './modules/auth'
import { profileRouter } from './modules/profile'
import { errorHandler } from './errors'
import { protectedApiRouter } from './routes/protected-api.router'
import { UPLOAD_DIR } from './lib/upload'

const app = express()

app.set('trust proxy', 1)
app.use(express.json())
app.use(cookieParser())

// 아바타 URL은 화면에서 일반 <img> 주소로 사용되고 Google 아바타도 공개 URL이므로
// 별도 인증 없이 제공한다. 반대로 카드 첨부 파일은 워크스페이스 정보가 포함될 수 있어
// 정적 경로로 열지 않고, 권한을 검사하는 다운로드 라우트를 통과시킨다.
app.use('/uploads/avatars', express.static(path.join(UPLOAD_DIR, 'avatars')))

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// 로컬 Google 클라이언트와의 호환 경로이며 정식 콜백은 /api/auth 아래에 둔다.
app.get('/oauth/google', googleCallback)

app.use('/api/auth', authRouter)
// 공개 프로필은 로그인하지 않은 방문자도 볼 수 있어 인증 라우터 밖에 둔다.
app.use('/api/users', profileRouter)
app.use('/api', protectedApiRouter)
app.use(errorHandler)

export default app
