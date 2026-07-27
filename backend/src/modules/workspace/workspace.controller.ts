import type { RequestHandler } from 'express'
import * as svc from './workspace.service'
import {
  changeWorkspaceRoleSchema,
  createWorkspaceSchema,
  inviteWorkspaceMemberSchema,
  updateWorkspaceSchema,
} from './workspace.schemas'

export const list: RequestHandler = async (req, res) => {
  const workspaces = await svc.listWorkspaces({ actorId: req.user!.id })
  res.status(200).json(workspaces)
}

export const create: RequestHandler = async (req, res) => {
  const body = createWorkspaceSchema.parse(req.body)
  const workspace = await svc.createWorkspace({
    actorId: req.user!.id,
    name: body.name,
    isPublic: body.is_public,
  })
  res.status(201).json(workspace)
}

export const getOne: RequestHandler = async (req, res) => {
  const workspace = await svc.getWorkspace({
    actorId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json(workspace)
}

export const update: RequestHandler = async (req, res) => {
  const data = updateWorkspaceSchema.parse(req.body)
  const workspace = await svc.updateWorkspace({
    actorId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...('is_public' in data ? { isPublic: data.is_public } : {}),
  })
  res.status(200).json(workspace)
}

export const remove: RequestHandler = async (req, res) => {
  await svc.deleteWorkspace({
    actorId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json({ ok: true })
}

export const inviteMember: RequestHandler = async (req, res) => {
  const data = inviteWorkspaceMemberSchema.parse(req.body)
  await svc.inviteWorkspaceMember({
    actorId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
    email: data.email,
    role: data.role,
  })
  res.status(201).json({ ok: true })
}

export const acceptInvite: RequestHandler = async (req, res) => {
  const workspace = await svc.acceptInvite({
    actorId: req.user!.id,
    token: req.params.token as string,
  })
  res.status(200).json(workspace)
}

export const changeMemberRole: RequestHandler = async (req, res) => {
  const body = changeWorkspaceRoleSchema.parse(req.body)
  const workspace = await svc.changeMemberRole({
    actorId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
    targetUserId: req.params.userId as string,
    role: body.role,
  })
  res.status(200).json(workspace)
}

export const removeMember: RequestHandler = async (req, res) => {
  await svc.removeMember({
    actorId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
    targetUserId: req.params.userId as string,
  })
  res.status(200).json({ ok: true })
}
