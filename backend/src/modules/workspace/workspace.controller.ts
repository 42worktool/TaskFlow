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

const roleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'])

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: roleSchema.optional().default('MEMBER'),
})

const updateMemberRoleSchema = z.object({
  role: roleSchema,
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

/** POST /workspaces/:workspaceId/members */
export async function inviteMember(req: Request, res: Response) {
  try {
    const body = inviteMemberSchema.parse(req.body)
    const data = await svc.inviteMember(
      req.user!.id,
      req.params.workspaceId as string,
      body.email,
      body.role,
    )
    res.status(201).json(data)
  } catch (e) {
    handleError(res, e)
  }
}

/** PUT /workspaces/:workspaceId/members/:userId */
export async function updateMemberRole(req: Request, res: Response) {
  try {
    const body = updateMemberRoleSchema.parse(req.body)
    const data = await svc.updateWorkspaceMemberRole(
      req.user!.id,
      req.params.workspaceId as string,
      req.params.userId as string,
      body.role,
    )
    res.status(200).json(data)
  } catch (e) {
    handleError(res, e)
  }
}

/** DELETE /workspaces/:workspaceId/members/:userId */
export async function removeMember(req: Request, res: Response) {
  try {
    await svc.removeWorkspaceMember(
      req.user!.id,
      req.params.workspaceId as string,
      req.params.userId as string,
    )
    res.status(204).send()
  } catch (e) {
    handleError(res, e)
  }
}

// ------------------------------------------------------------
// Error mapping (service errors → HTTP status)
// ------------------------------------------------------------
function handleError(res: Response, e: unknown) {
  if (e instanceof svc.NotFoundError) {
    res.status(404).json({
      status_code: 404,
      error: e.code,
      message: e.message,
    })
    return
  }
  if (e instanceof svc.ForbiddenError) {
    res.status(403).json({
      status_code: 403,
      error: e.code,
      message: e.message,
    })
    return
  }
  if (e instanceof svc.BadRequestError) {
    res.status(400).json({
      status_code: 400,
      error: e.code,
      message: e.message,
    })
    return
  }
  if (e instanceof z.ZodError) {
    res.status(400).json({
      status_code: 400,
      error: 'VALIDATION_ERROR',
      message: e.issues[0].message,
    })
    return
  }
  res.status(500).json({
    status_code: 500,
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  })
}
