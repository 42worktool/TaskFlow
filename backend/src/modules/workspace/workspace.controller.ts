// ============================================================
// workspace.controller.ts — HTTP layer for workspace CRUD
//
// Handles input validation (zod), calls the service, and maps
// service errors (ForbiddenError / NotFoundError) to HTTP statuses.
// No business logic lives here.
// ============================================================
import type { Request, Response } from 'express'
import { z } from 'zod'
import * as svc from './workspace.service'

// ------------------------------------------------------------
// Zod schemas
// ------------------------------------------------------------
const createSchema = z.object({
  name: z.string().min(1).max(100),
  is_public: z.boolean().optional().default(false),
})

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    is_public: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.is_public !== undefined, {
    message: 'either name or is_public is required',
  })

// ------------------------------------------------------------
// Handlers
// ------------------------------------------------------------

/** GET /workspaces */
export async function list(req: Request, res: Response) {
  try {
    const data = await svc.listWorkspaces(req.user!.id)
    res.status(200).json(data)
  } catch (e) {
    handleError(res, e)
  }
}

/** POST /workspaces */
export async function create(req: Request, res: Response) {
  try {
    const body = createSchema.parse(req.body)
    const data = await svc.createWorkspace(req.user!.id, body.name, body.is_public)
    res.status(201).json(data)
  } catch (e) {
    handleError(res, e)
  }
}

/** GET /workspaces/:workspaceId */
export async function getOne(req: Request, res: Response) {
  try {
    const data = await svc.getWorkspace(req.user!.id, req.params.workspaceId as string)
    res.status(200).json(data)
  } catch (e) {
    handleError(res, e)
  }
}

/** PUT /workspaces/:workspaceId */
export async function update(req: Request, res: Response) {
  try {
    const body = updateSchema.parse(req.body)
    const data = await svc.updateWorkspace(req.user!.id, req.params.workspaceId as string, body)
    res.status(200).json(data)
  } catch (e) {
    handleError(res, e)
  }
}

/** DELETE /workspaces/:workspaceId */
export async function remove(req: Request, res: Response) {
  try {
    await svc.deleteWorkspace(req.user!.id, req.params.workspaceId as string)
    res.status(200).json({ ok: true })
  } catch (e) {
    handleError(res, e)
  }
}

// ------------------------------------------------------------
// Error mapping (service errors → HTTP status)
// ------------------------------------------------------------
function handleError(res: Response, e: unknown) {
  if (e instanceof svc.NotFoundError) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }
  if (e instanceof svc.ForbiddenError) {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: e.issues[0].message })
    return
  }
  res.status(500).json({ error: 'server error' })
}
