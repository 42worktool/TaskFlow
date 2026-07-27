import type { RequestHandler } from 'express'
import * as svc from './card.service'
import {
  addAttachmentSchema,
  addCardMemberSchema,
  cardDatesSchema,
  cardNeighborSchema,
  commentSchema,
  createCardSchema,
  moveCardSchema,
  updateCardSchema,
} from './card.schemas'

export const create: RequestHandler = async (req, res) => {
  const data = createCardSchema.parse(req.body)
  const card = await svc.createCard({
    actorId: req.user!.id,
    listId: req.params.list_id as string,
    title: data.title,
    description: data.description,
    startAt: data.start_at,
    deadline: data.deadline,
  })
  res.status(201).json(card)
}

export const getOne: RequestHandler = async (req, res) => {
  const card = await svc.getCard({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
  })
  res.status(200).json(card)
}

export const update: RequestHandler = async (req, res) => {
  const data = updateCardSchema.parse(req.body)
  const card = await svc.updateCard({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...('description' in data ? { description: data.description } : {}),
  })
  res.status(200).json(card)
}

export const remove: RequestHandler = async (req, res) => {
  await svc.deleteCard({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
  })
  res.status(204).send()
}

export const reorder: RequestHandler = async (req, res) => {
  const data = cardNeighborSchema.parse(req.body)
  const card = await svc.reorderCard({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    beforeCardId: data.before_card_id,
    afterCardId: data.after_card_id,
  })
  res.status(200).json(card)
}

export const move: RequestHandler = async (req, res) => {
  const data = moveCardSchema.parse(req.body)
  const card = await svc.moveCard({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    targetListId: data.list_id,
    beforeCardId: data.before_card_id,
    afterCardId: data.after_card_id,
  })
  res.status(200).json(card)
}

export const updateDates: RequestHandler = async (req, res) => {
  const data = cardDatesSchema.parse(req.body)
  const card = await svc.updateCardDates({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    ...('start_at' in data ? { startAt: data.start_at } : {}),
    ...('deadline' in data ? { deadline: data.deadline } : {}),
  })
  res.status(200).json(card)
}

export const moveToInbox: RequestHandler = async (req, res) => {
  const card = await svc.moveCardToInbox({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
  })
  res.status(200).json(card)
}

export const addMember: RequestHandler = async (req, res) => {
  const body = addCardMemberSchema.parse(req.body)
  const member = await svc.addCardMember({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    targetUserId: body.user_id,
  })
  res.status(201).json(member)
}

export const removeMember: RequestHandler = async (req, res) => {
  await svc.removeCardMember({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    targetUserId: req.params.user_id as string,
  })
  res.status(204).send()
}

export const addAttachment: RequestHandler = async (req, res) => {
  const data = addAttachmentSchema.parse(req.body)
  const attachment = await svc.addAttachment({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    fileUrl: data.file_url,
    fileName: data.file_name,
  })
  res.status(201).json(attachment)
}

export const removeAttachment: RequestHandler = async (req, res) => {
  await svc.removeAttachment({
    actorId: req.user!.id,
    attachmentId: req.params.attachment_id as string,
  })
  res.status(204).send()
}

export const createComment: RequestHandler = async (req, res) => {
  const data = commentSchema.parse(req.body)
  const comment = await svc.createComment({
    actorId: req.user!.id,
    cardId: req.params.card_id as string,
    comment: data.comment_str,
  })
  res.status(201).json(comment)
}

export const updateComment: RequestHandler = async (req, res) => {
  const data = commentSchema.parse(req.body)
  const comment = await svc.updateComment({
    actorId: req.user!.id,
    commentId: req.params.comment_id as string,
    comment: data.comment_str,
  })
  res.status(200).json(comment)
}

export const deleteComment: RequestHandler = async (req, res) => {
  await svc.deleteComment({
    actorId: req.user!.id,
    commentId: req.params.comment_id as string,
  })
  res.status(204).send()
}
