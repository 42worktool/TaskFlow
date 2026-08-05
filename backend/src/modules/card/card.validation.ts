import { z } from 'zod'
import { uuidSchema } from '../../lib/validation'

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid date')

export const createCardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  start_at: isoDate.nullable().optional(),
  deadline: isoDate.nullable().optional(),
})

export const updateCardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
})

export const cardNeighborSchema = z
  .object({
    before_card_id: uuidSchema.nullable().optional(),
    after_card_id: uuidSchema.nullable().optional(),
  })
  .refine(
    (value) => value.before_card_id !== undefined || value.after_card_id !== undefined,
    { message: 'either before_card_id or after_card_id is required' },
  )

export const moveCardSchema = z.object({
  list_id: uuidSchema,
  before_card_id: uuidSchema.nullable().optional(),
  after_card_id: uuidSchema.nullable().optional(),
})

export const cardDatesSchema = z
  .object({
    start_at: isoDate.nullable().optional(),
    deadline: isoDate.nullable().optional(),
  })
  .refine((value) => value.start_at !== undefined || value.deadline !== undefined, {
    message: 'either start_at or deadline is required',
  })

export const cardCompletionSchema = z.object({
  is_completed: z.boolean(),
})

export const commentSchema = z.object({
  comment_str: z.string().min(1).max(2000),
})
