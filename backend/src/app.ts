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

// Avatars are served without auth: profile_image_url is already rendered as a
// plain <img src> across the app (and Google OAuth avatars are unauthenticated
// public URLs too), so this matches the app's existing exposure level. Card
// attachments are NOT served here — those go through an authenticated,
// workspace-permission-checked download route instead (see card.router.ts).
app.use('/uploads/avatars', express.static(path.join(UPLOAD_DIR, 'avatars')))

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Local Google client compatibility. The canonical callback remains under /api/auth.
app.get('/oauth/google', googleCallback)

app.use('/api/auth', authRouter)
// Public profile reads intentionally sit outside protectedApiRouter.
app.use('/api/users', profileRouter)
app.use('/api', protectedApiRouter)
app.use(errorHandler)

export default app
