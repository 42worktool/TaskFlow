import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import * as svc from './label.service'
import { attachLabelSchema, labelSchema } from './label.validation'

export const list: RequestHandler = async (req, res) => {
  const labels = await svc.listLabels({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json(labels)
}

export const create: RequestHandler = async (req, res) => {
  const data = labelSchema.parse(req.body)
  const label = await svc.createLabel({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    labelName: data.label_name,
    labelColor: data.label_color,
  })
  res.status(201).json(label)
}

export const remove: RequestHandler = async (req, res) => {
  await svc.deleteLabel({
    userId: authenticatedUserId(req),
    labelId: req.params.label_id as string,
  })
  res.status(204).send()
}

export const attach: RequestHandler = async (req, res) => {
  const data = attachLabelSchema.parse(req.body)
  const label = await svc.addCardLabel({
    userId: authenticatedUserId(req),
    cardId: req.params.card_id as string,
    labelId: data.label_id,
  })
  res.status(201).json(label)
}

export const detach: RequestHandler = async (req, res) => {
  await svc.removeCardLabel({
    userId: authenticatedUserId(req),
    cardId: req.params.card_id as string,
    labelId: req.params.label_id as string,
  })
  res.status(204).send()
}
