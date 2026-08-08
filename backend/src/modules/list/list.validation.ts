// 리스트 이름과 이웃 ID 기반 재정렬 입력을 서비스 진입 전에 검증한다.
import { z } from 'zod'
import { uuidSchema } from '../../lib/validation'

const listName = z.string().min(1).max(100)

export const createListSchema = z
  .object({
    name: listName,
  })
  .strict()

export const updateListSchema = z
  .object({
    name: listName,
  })
  .strict()

export const listReorderSchema = z
  .object({
    before_list_id: uuidSchema.nullable().optional(),
    after_list_id: uuidSchema.nullable().optional(),
  })
  .refine((value) => value.before_list_id !== undefined || value.after_list_id !== undefined, {
    message: 'either before_list_id or after_list_id is required',
  })
