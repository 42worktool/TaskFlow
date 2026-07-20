import { Request, Response } from 'express';
import { AppError } from '../../errors';
import * as service from './card.service';

function resolveUserId(req: Request): string {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    throw new AppError(401, 'Missing x-user-id header');
  }
  return userId;
}

function sendError(res: Response, err: unknown): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status_code: err.statusCode,
      error: err.name,
      message: err.message,
    });
    return;
  }
  console.error(err);
  res.status(500).json({ status_code: 500, error: 'INTERNAL_ERROR', message: 'Internal server error' });
}

// ─── Cards ────────────────────────────────────────────────────

export async function createCard(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const listId = req.params['list_id'] as string;
    const { title, description, start_at, deadline } = req.body as {
      title: string;
      description?: string | null;
      start_at?: string | null;
      deadline?: string | null;
    };
    if (!title) {
      res.status(400).json({ status_code: 400, error: 'VALIDATION_ERROR', message: 'title is required' });
      return;
    }
    res.status(201).json(service.createCard(userId, listId, { title, description, start_at, deadline }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function getCard(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    res.json(service.getCard(userId, req.params['card_id'] as string));
  } catch (e) {
    sendError(res, e);
  }
}

export async function updateCard(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { title, description } = req.body as { title?: string; description?: string | null };
    res.json(service.updateCard(userId, req.params['card_id'] as string, { title, description }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function deleteCard(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    service.deleteCard(userId, req.params['card_id'] as string);
    res.status(204).send();
  } catch (e) {
    sendError(res, e);
  }
}

export async function reorderCard(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { before_card_id, after_card_id } = req.body as {
      before_card_id?: string | null;
      after_card_id?: string | null;
    };
    res.json(service.reorderCard(userId, req.params['card_id'] as string, { before_card_id, after_card_id }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function moveCard(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { list_id, before_card_id, after_card_id } = req.body as {
      list_id: string;
      before_card_id?: string | null;
      after_card_id?: string | null;
    };
    if (!list_id) {
      res.status(400).json({ status_code: 400, error: 'VALIDATION_ERROR', message: 'list_id is required' });
      return;
    }
    res.json(service.moveCard(userId, req.params['card_id'] as string, { list_id, before_card_id, after_card_id }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function updateCardDates(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { start_at, deadline } = req.body as { start_at?: string | null; deadline?: string | null };
    res.json(service.updateCardDates(userId, req.params['card_id'] as string, { start_at, deadline }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function moveCardToInbox(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    res.json(service.moveCardToInbox(userId, req.params['card_id'] as string));
  } catch (e) {
    sendError(res, e);
  }
}

// ─── Card Members ─────────────────────────────────────────────

export async function addCardMember(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { user_id: targetUserId } = req.body as { user_id: string };
    if (!targetUserId) {
      res.status(400).json({ status_code: 400, error: 'VALIDATION_ERROR', message: 'user_id is required' });
      return;
    }
    res.status(201).json(service.addCardMember(userId, req.params['card_id'] as string, targetUserId));
  } catch (e) {
    sendError(res, e);
  }
}

export async function removeCardMember(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    service.removeCardMember(userId, req.params['card_id'] as string, req.params['user_id'] as string);
    res.status(204).send();
  } catch (e) {
    sendError(res, e);
  }
}

// ─── Attachments ──────────────────────────────────────────────

export async function addAttachment(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { file_url, file_name } = req.body as { file_url: string; file_name: string };
    if (!file_url || !file_name) {
      res.status(400).json({ status_code: 400, error: 'VALIDATION_ERROR', message: 'file_url and file_name are required' });
      return;
    }
    res.status(201).json(service.addAttachment(userId, req.params['card_id'] as string, { file_url, file_name }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function removeAttachment(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    service.removeAttachment(userId, req.params['attachment_id'] as string);
    res.status(204).send();
  } catch (e) {
    sendError(res, e);
  }
}

// ─── Comments ─────────────────────────────────────────────────

export async function createComment(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { comment_str } = req.body as { comment_str: string };
    if (!comment_str) {
      res.status(400).json({ status_code: 400, error: 'VALIDATION_ERROR', message: 'comment_str is required' });
      return;
    }
    res.status(201).json(service.createComment(userId, req.params['card_id'] as string, { comment_str }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function updateComment(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    const { comment_str } = req.body as { comment_str: string };
    if (!comment_str) {
      res.status(400).json({ status_code: 400, error: 'VALIDATION_ERROR', message: 'comment_str is required' });
      return;
    }
    res.json(service.updateComment(userId, req.params['comment_id'] as string, { comment_str }));
  } catch (e) {
    sendError(res, e);
  }
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    service.deleteComment(userId, req.params['comment_id'] as string);
    res.status(204).send();
  } catch (e) {
    sendError(res, e);
  }
}
