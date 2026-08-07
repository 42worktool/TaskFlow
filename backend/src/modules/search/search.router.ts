import { Router } from 'express'
import * as searchController from './search.controller'

export const searchRouter = Router()

searchRouter.get('/', searchController.search)
