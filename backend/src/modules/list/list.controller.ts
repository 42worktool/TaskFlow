// ============================================================
// list.controller.ts — HTTP layer for list CRUD
// ============================================================
import type { Request, Response } from 'express'
import { z } from 'zod'
import { sendError } from '../../errors'
import * as svc from './list.service'

const nameSchema = z.object({
  name: z.string().min(1).max(100),
})

const reorderSchema = z
  .object({
    before_list_id: z.string().uuid().nullable().optional(),
    after_list_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.before_list_id !== undefined || v.after_list_id !== undefined, {
    message: 'either before_list_id or after_list_id is required',
  })

/** GET /workspaces/:workspaceId/lists */
export async function list(req: Request, res: Response) {
  try {
    const data = await svc.listLists(req.user!.id, req.params.workspaceId as string)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** POST /workspaces/:workspaceId/lists */
export async function create(req: Request, res: Response) {
  try {
    const body = nameSchema.parse(req.body)
    const data = await svc.createList(req.user!.id, req.params.workspaceId as string, body.name)
    res.status(201).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /lists/:list_id */
export async function update(req: Request, res: Response) {
  try {
    const body = nameSchema.parse(req.body)
    const data = await svc.updateList(req.user!.id, req.params.list_id as string, body.name)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE /lists/:list_id */
export async function remove(req: Request, res: Response) {
  try {
    await svc.deleteList(req.user!.id, req.params.list_id as string)
    res.status(204).send()
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /lists/:list_id/order */
export async function reorder(req: Request, res: Response) {
  try {
    const body = reorderSchema.parse(req.body)
    const data = await svc.reorderList(req.user!.id, req.params.list_id as string, body)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}
