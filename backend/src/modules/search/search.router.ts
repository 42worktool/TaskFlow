// 인증 API 아래의 단일 검색 엔드포인트를 검색 컨트롤러에 연결한다.
import { Router } from 'express'
import * as searchController from './search.controller'

export const searchRouter = Router()

searchRouter.get('/', searchController.search)
