import type { RequestHandler } from 'express'
import {
  createWorkspaceMessage,
  listWorkspaceMessages,
} from './workspace-message.service'
import { createWorkspaceMessageSchema } from './workspace-message.validation'

export const list: RequestHandler = async (req, res) => {
  const messages = await listWorkspaceMessages({
    userId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json(messages)
}

export const create: RequestHandler = async (req, res) => {
  const body = createWorkspaceMessageSchema.parse(req.body)
  const message = await createWorkspaceMessage({
    userId: req.user!.id,
    workspaceId: req.params.workspaceId as string,
    content: body.content,
  })
  res.status(201).json(message)
}
