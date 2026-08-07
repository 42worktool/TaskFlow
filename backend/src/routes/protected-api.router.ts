import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { cardRouter, commentRouter, inboxRouter } from '../modules/card'
import { friendRouter } from '../modules/friend'
import { labelRouter } from '../modules/label'
import { listRouter } from '../modules/list'
import { profileSearchRouter } from '../modules/profile'
import { searchRouter } from '../modules/search'
import { workspaceRouter } from '../modules/workspace'

export const protectedApiRouter = Router()

protectedApiRouter.use(requireAuth)
protectedApiRouter.use('/workspaces', workspaceRouter)
protectedApiRouter.use('/lists', listRouter)
protectedApiRouter.use('/cards', cardRouter)
protectedApiRouter.use('/comments', commentRouter)
protectedApiRouter.use('/labels', labelRouter)
protectedApiRouter.use('/friends', friendRouter)
protectedApiRouter.use('/inbox', inboxRouter)
protectedApiRouter.use('/users', profileSearchRouter)
protectedApiRouter.use('/search', searchRouter)
