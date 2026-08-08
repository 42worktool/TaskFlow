// 검색어, 카테고리, 워크스페이스·레이블 범위, 정렬, 페이지 조건의 입력 경계를 정의한다.
import { z } from 'zod'
import { uuidSchema } from '../../lib/validation'

export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(80).default(''),
    type: z.enum(['all', 'workspace', 'card', 'user']).default('all'),
    workspace_id: uuidSchema.optional(),
    label_id: uuidSchema.optional(),
    sort: z.enum(['relevance', 'newest', 'name']).default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine((query) => !query.label_id || Boolean(query.workspace_id), {
    message: 'workspace_id is required when label_id is provided',
    path: ['workspace_id'],
  })
  .refine((query) => !query.label_id || query.type === 'all' || query.type === 'card', {
    message: 'label_id is only supported for all or card searches',
    path: ['label_id'],
  })
