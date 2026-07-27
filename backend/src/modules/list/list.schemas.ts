import { z } from 'zod'

export const listNameSchema = z.object({
  name: z.string().min(1).max(100),
})

export const listReorderSchema = z
  .object({
    before_list_id: z.string().uuid().nullable().optional(),
    after_list_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) => value.before_list_id !== undefined || value.after_list_id !== undefined,
    { message: 'either before_list_id or after_list_id is required' },
  )

export type ListNameBody = z.infer<typeof listNameSchema>
export type ListReorderBody = z.infer<typeof listReorderSchema>
