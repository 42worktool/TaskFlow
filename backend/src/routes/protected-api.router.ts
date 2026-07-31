import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { cardRouter, commentRouter, inboxRouter } from '../modules/card'
import { friendRouter } from '../modules/friend'
import { listRouter } from '../modules/list'
import { workspaceRouter } from '../modules/workspace'

export const protectedApiRouter = Router()

protectedApiRouter.use(requireAuth)
protectedApiRouter.use('/workspaces', workspaceRouter)
protectedApiRouter.use('/lists', listRouter)
protectedApiRouter.use('/cards', cardRouter)
protectedApiRouter.use('/comments', commentRouter)
protectedApiRouter.use('/friends', friendRouter)
protectedApiRouter.use('/inbox', inboxRouter)
