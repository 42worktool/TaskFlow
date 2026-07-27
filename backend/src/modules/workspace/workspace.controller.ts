// ============================================================
// workspace.controller.ts — HTTP layer for workspace CRUD
//
// Handles input validation (zod), calls the service, and maps
// service errors (ForbiddenError / NotFoundError) to HTTP statuses.
// No business logic lives here.
// ============================================================
import type { Request, Response } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { sendError } from '../../errors'
import * as svc from './workspace.service'
import { checkMailRateLimit } from '../../lib/mail-rate-limiter'
import { inviteEmail } from '../../lib/mail-templates'
import { enqueue } from '../../lib/mail-queue'

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

const inviteMemberSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
})

const changeRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
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
    sendError(res, e)
  }
}

/** POST /workspaces */
export async function create(req: Request, res: Response) {
  try {
    const body = createSchema.parse(req.body)
    const data = await svc.createWorkspace(req.user!.id, body.name, body.is_public)
    res.status(201).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** GET /workspaces/:workspaceId */
export async function getOne(req: Request, res: Response) {
  try {
    const data = await svc.getWorkspace(req.user!.id, req.params.workspaceId as string)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /workspaces/:workspaceId */
export async function update(req: Request, res: Response) {
  try {
    const body = updateSchema.parse(req.body)
    const data = await svc.updateWorkspace(req.user!.id, req.params.workspaceId as string, body)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE /workspaces/:workspaceId */
export async function remove(req: Request, res: Response) {
  try {
    await svc.deleteWorkspace(req.user!.id, req.params.workspaceId as string)
    res.status(200).json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
}

/** POST /workspaces/:workspaceId/members */
export async function inviteMember(req: Request, res: Response) {
  try {
    const body = inviteMemberSchema.parse(req.body)
    const ws = await svc.getWorkspace(req.user!.id, req.params.workspaceId as string)
    await svc.requireRole(req.params.workspaceId as string, req.user!.id, 'ADMIN')

    const token = svc.generateInviteToken(
      req.params.workspaceId as string,
      body.role,
      body.email,
    )

    const inviteUrl = `${config.appOrigin}/invite/${token}`

    await checkMailRateLimit(body.email)
    await enqueue({ to: body.email, ...inviteEmail(ws.name, inviteUrl) })

    res.status(201).json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
}

/** POST /invite/:token */
export async function acceptInvite(req: Request, res: Response) {
  try {
    const data = await svc.acceptInvite(req.user!.id, req.params.token as string)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /workspaces/:workspaceId/members/:userId */
export async function changeMemberRole(req: Request, res: Response) {
  try {
    const body = changeRoleSchema.parse(req.body)
    const data = await svc.changeMemberRole(
      req.user!.id,
      req.params.workspaceId as string,
      req.params.userId as string,
      body.role,
    )
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE /workspaces/:workspaceId/members/:userId */
export async function removeMember(req: Request, res: Response) {
  try {
    await svc.removeMember(
      req.user!.id,
      req.params.workspaceId as string,
      req.params.userId as string,
    )
    res.status(200).json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
}
