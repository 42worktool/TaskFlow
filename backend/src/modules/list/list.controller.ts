// 리스트 CRUD·순서 변경 요청을 파싱해 권한을 처리하는 서비스로 전달한다.
import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import * as svc from './list.service'
import { createListSchema, listReorderSchema, updateListSchema } from './list.validation'

export const list: RequestHandler = async (req, res) => {
  const lists = await svc.listLists({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json(lists)
}

export const getOne: RequestHandler = async (req, res) => {
  const list = await svc.getList({
    userId: authenticatedUserId(req),
    listId: req.params.list_id as string,
  })
  res.status(200).json(list)
}

export const create: RequestHandler = async (req, res) => {
  const body = createListSchema.parse(req.body)
  const list = await svc.createList({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    name: body.name,
  })
  res.status(201).json(list)
}

export const update: RequestHandler = async (req, res) => {
  const body = updateListSchema.parse(req.body)
  const list = await svc.updateList({
    userId: authenticatedUserId(req),
    listId: req.params.list_id as string,
    name: body.name,
  })
  res.status(200).json(list)
}

export const remove: RequestHandler = async (req, res) => {
  await svc.deleteList({
    userId: authenticatedUserId(req),
    listId: req.params.list_id as string,
  })
  res.status(204).send()
}

export const reorder: RequestHandler = async (req, res) => {
  const data = listReorderSchema.parse(req.body)
  const list = await svc.reorderList({
    userId: authenticatedUserId(req),
    listId: req.params.list_id as string,
    beforeListId: data.before_list_id,
    afterListId: data.after_list_id,
  })
  res.status(200).json(list)
}
