import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import * as svc from './workspace.service'
import {
  changeWorkspaceRoleSchema,
  createWorkspaceSchema,
  inviteWorkspaceMemberSchema,
  updateWorkspaceSchema,
} from './workspace.validation'

export const list: RequestHandler = async (req, res) => {
  const workspaces = await svc.listWorkspaces({
    userId: authenticatedUserId(req),
  })
  res.status(200).json(workspaces)
}

export const create: RequestHandler = async (req, res) => {
  const body = createWorkspaceSchema.parse(req.body)
  const workspace = await svc.createWorkspace({
    userId: authenticatedUserId(req),
    name: body.name,
    isPublic: body.is_public,
  })
  res.status(201).json(workspace)
}

export const getOne: RequestHandler = async (req, res) => {
  const workspace = await svc.getWorkspace({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json(workspace)
}

export const update: RequestHandler = async (req, res) => {
  const data = updateWorkspaceSchema.parse(req.body)
  const workspace = await svc.updateWorkspace({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...('is_public' in data ? { isPublic: data.is_public } : {}),
  })
  res.status(200).json(workspace)
}

export const remove: RequestHandler = async (req, res) => {
  await svc.deleteWorkspace({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json({ ok: true })
}

export const inviteMember: RequestHandler = async (req, res) => {
  const data = inviteWorkspaceMemberSchema.parse(req.body)
  await svc.inviteWorkspaceMember({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    email: data.email,
    role: data.role,
  })
  res.status(201).json({ ok: true })
}

export const acceptInvite: RequestHandler = async (req, res) => {
  const workspace = await svc.acceptInvite({
    userId: authenticatedUserId(req),
    token: req.params.token as string,
  })
  res.status(200).json(workspace)
}

export const previewInvite: RequestHandler = async (req, res) => {
  const invitation = await svc.previewInvite({
    userId: authenticatedUserId(req),
    token: req.params.token as string,
  })
  res.status(200).json(invitation)
}

export const changeMemberRole: RequestHandler = async (req, res) => {
  const body = changeWorkspaceRoleSchema.parse(req.body)
  const workspace = await svc.changeMemberRole({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    targetUserId: req.params.userId as string,
    role: body.role,
  })
  res.status(200).json(workspace)
}

export const transferOwnership: RequestHandler = async (req, res) => {
  const workspace = await svc.transferWorkspaceOwnership({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    targetUserId: req.params.userId as string,
  })
  res.status(200).json(workspace)
}

export const leave: RequestHandler = async (req, res) => {
  await svc.leaveWorkspace({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
  })
  res.status(204).send()
}

export const removeMember: RequestHandler = async (req, res) => {
  await svc.removeMember({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    targetUserId: req.params.userId as string,
  })
  res.status(200).json({ ok: true })
}
