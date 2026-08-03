import { z } from 'zod'
import { uuidSchema } from '../../lib/validation'

export const labelSchema = z.object({
  label_name: z.string().trim().min(1).max(50),
  label_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'label_color must be a six-digit hexadecimal color'),
}).strict()

export const attachLabelSchema = z.object({
  label_id: uuidSchema,
}).strict()
