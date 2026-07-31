import { z } from 'zod'
import { uuidSchema } from '../../lib/validation'

const listName = z.string().min(1).max(100)

export const createListSchema = z
  .object({
    name: listName,
    is_done: z.boolean().optional().default(false),
  })
  .strict()

export const updateListSchema = z
  .object({
    name: listName.optional(),
    is_done: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.is_done !== undefined,
    { message: 'either name or is_done is required' },
  )

export const listReorderSchema = z
  .object({
    before_list_id: uuidSchema.nullable().optional(),
    after_list_id: uuidSchema.nullable().optional(),
  })
  .refine(
    (value) => value.before_list_id !== undefined || value.after_list_id !== undefined,
    { message: 'either before_list_id or after_list_id is required' },
  )
