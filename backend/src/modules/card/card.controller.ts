// ============================================================
// card.controller.ts — HTTP layer for cards, members, attachments, comments
// ============================================================
import type { Request, Response } from 'express'
import { z } from 'zod'
import { sendError } from '../../errors'
import * as svc from './card.service'

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date')

const createCardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  start_at: isoDate.nullable().optional(),
  deadline: isoDate.nullable().optional(),
})

const updateCardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
})

const neighborSchema = z
  .object({
    before_card_id: z.string().uuid().nullable().optional(),
    after_card_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.before_card_id !== undefined || v.after_card_id !== undefined, {
    message: 'either before_card_id or after_card_id is required',
  })

const moveCardSchema = z.object({
  list_id: z.string().uuid(),
  before_card_id: z.string().uuid().nullable().optional(),
  after_card_id: z.string().uuid().nullable().optional(),
})

const datesSchema = z
  .object({
    start_at: isoDate.nullable().optional(),
    deadline: isoDate.nullable().optional(),
  })
  .refine((v) => v.start_at !== undefined || v.deadline !== undefined, {
    message: 'either start_at or deadline is required',
  })

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
})

const addAttachmentSchema = z.object({
  file_url: z.string().url(),
  file_name: z.string().min(1).max(255),
})

const commentSchema = z.object({
  comment_str: z.string().min(1).max(2000),
})

// ─── Cards ────────────────────────────────────────────────────

/** POST /lists/:list_id/cards */
export async function create(req: Request, res: Response) {
  try {
    const body = createCardSchema.parse(req.body)
    const data = await svc.createCard(req.user!.id, req.params.list_id as string, body)
    res.status(201).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** GET /cards/:card_id */
export async function getOne(req: Request, res: Response) {
  try {
    const data = await svc.getCard(req.user!.id, req.params.card_id as string)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /cards/:card_id */
export async function update(req: Request, res: Response) {
  try {
    const body = updateCardSchema.parse(req.body)
    const data = await svc.updateCard(req.user!.id, req.params.card_id as string, body)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE /cards/:card_id */
export async function remove(req: Request, res: Response) {
  try {
    await svc.deleteCard(req.user!.id, req.params.card_id as string)
    res.status(204).send()
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /cards/:card_id/order */
export async function reorder(req: Request, res: Response) {
  try {
    const body = neighborSchema.parse(req.body)
    const data = await svc.reorderCard(req.user!.id, req.params.card_id as string, body)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /cards/:card_id/move */
export async function move(req: Request, res: Response) {
  try {
    const body = moveCardSchema.parse(req.body)
    const data = await svc.moveCard(req.user!.id, req.params.card_id as string, body)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PATCH /cards/:card_id/dates */
export async function updateDates(req: Request, res: Response) {
  try {
    const body = datesSchema.parse(req.body)
    const data = await svc.updateCardDates(req.user!.id, req.params.card_id as string, body)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT /cards/:card_id/inbox */
export async function moveToInbox(req: Request, res: Response) {
  try {
    const data = await svc.moveCardToInbox(req.user!.id, req.params.card_id as string)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

// ─── Card Members ─────────────────────────────────────────────

/** POST /cards/:card_id/members */
export async function addMember(req: Request, res: Response) {
  try {
    const body = addMemberSchema.parse(req.body)
    const data = await svc.addCardMember(req.user!.id, req.params.card_id as string, body.user_id)
    res.status(201).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE /cards/:card_id/members/:user_id */
export async function removeMember(req: Request, res: Response) {
  try {
    await svc.removeCardMember(req.user!.id, req.params.card_id as string, req.params.user_id as string)
    res.status(204).send()
  } catch (e) {
    sendError(res, e)
  }
}

// ─── Attachments ──────────────────────────────────────────────

/** POST /cards/:card_id/attachments */
export async function addAttachment(req: Request, res: Response) {
  try {
    const body = addAttachmentSchema.parse(req.body)
    const data = await svc.addAttachment(req.user!.id, req.params.card_id as string, body)
    res.status(201).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE /cards/attachments/:attachment_id */
export async function removeAttachment(req: Request, res: Response) {
  try {
    await svc.removeAttachment(req.user!.id, req.params.attachment_id as string)
    res.status(204).send()
  } catch (e) {
    sendError(res, e)
  }
}

// ─── Comments ─────────────────────────────────────────────────

/** POST /cards/:card_id/comments */
export async function createComment(req: Request, res: Response) {
  try {
    const body = commentSchema.parse(req.body)
    const data = await svc.createComment(req.user!.id, req.params.card_id as string, body)
    res.status(201).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** PATCH /comments/:comment_id */
export async function updateComment(req: Request, res: Response) {
  try {
    const body = commentSchema.parse(req.body)
    const data = await svc.updateComment(req.user!.id, req.params.comment_id as string, body)
    res.status(200).json(data)
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE /comments/:comment_id */
export async function deleteComment(req: Request, res: Response) {
  try {
    await svc.deleteComment(req.user!.id, req.params.comment_id as string)
    res.status(204).send()
  } catch (e) {
    sendError(res, e)
  }
}
