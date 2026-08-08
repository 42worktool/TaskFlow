// 워크스페이스 채팅 조회·작성 요청을 인증 사용자 기준의 서비스 호출로 연결한다.
import type { RequestHandler } from 'express'
import { authenticatedUserId } from '../../middleware/auth'
import { createWorkspaceMessage, listWorkspaceMessages } from './workspace-message.service'
import { createWorkspaceMessageSchema } from './workspace-message.validation'

export const list: RequestHandler = async (req, res) => {
  const messages = await listWorkspaceMessages({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
  })
  res.status(200).json(messages)
}

export const create: RequestHandler = async (req, res) => {
  const body = createWorkspaceMessageSchema.parse(req.body)
  const message = await createWorkspaceMessage({
    userId: authenticatedUserId(req),
    workspaceId: req.params.workspaceId as string,
    content: body.content,
    cardId: body.card_id,
  })
  res.status(201).json(message)
}
