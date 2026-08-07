import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import { searchQuerySchema } from './search.validation'
import * as searchService from './search.service'

export const search: RequestHandler = async (req, res) => {
  const query = searchQuerySchema.parse(req.query)
  res.status(200).json(
    await searchService.search({
      userId: authenticatedUserId(req),
      query: query.q,
      type: query.type,
      ...(query.workspace_id ? { workspaceId: query.workspace_id } : {}),
      ...(query.label_id ? { labelId: query.label_id } : {}),
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    }),
  )
}
