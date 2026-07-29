import type { RequestHandler } from 'express'
import * as svc from './list.service'
import { listNameSchema, listReorderSchema } from './list.validation'

export const list: RequestHandler = async (req, res) => {
  const lists = await svc.listLists({
    userId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json(lists)
}

export const getOne: RequestHandler = async (req, res) => {
  const list = await svc.getList({
    userId: req.user!.id,
    listId: req.params.list_id as string,
  })
  res.status(200).json(list)
}

export const create: RequestHandler = async (req, res) => {
  const body = listNameSchema.parse(req.body)
  const list = await svc.createList({
    userId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
    name: body.name,
  })
  res.status(201).json(list)
}

export const update: RequestHandler = async (req, res) => {
  const body = listNameSchema.parse(req.body)
  const list = await svc.updateList({
    userId: req.user!.id,
    listId: req.params.list_id as string,
    name: body.name,
  })
  res.status(200).json(list)
}

export const remove: RequestHandler = async (req, res) => {
  await svc.deleteList({
    userId: req.user!.id,
    listId: req.params.list_id as string,
  })
  res.status(204).send()
}

export const reorder: RequestHandler = async (req, res) => {
  const data = listReorderSchema.parse(req.body)
  const list = await svc.reorderList({
    userId: req.user!.id,
    listId: req.params.list_id as string,
    beforeListId: data.before_list_id,
    afterListId: data.after_list_id,
  })
  res.status(200).json(list)
}
