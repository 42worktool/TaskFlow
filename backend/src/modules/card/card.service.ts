import { AppError } from '../../errors';
import { CardRecord, ListRecord } from '../../store';
import { findUserById } from '../users/users.repository';
import * as workspaceRepo from '../workspace/workspace.repository';
import * as repo from './card.repository';

// ─── Helpers ──────────────────────────────────────────────────

function toCardDto(card: CardRecord) {
  return {
    id: card.id,
    list_id: card.list_id,
    title: card.title,
    description: card.description,
    start_at: card.start_at,
    deadline: card.deadline,
    sequence: card.sequence,
    created_at: card.created_at,
  };
}

function buildCardDetail(card: CardRecord) {
  const members = repo.findCardMembers(card.id).map((m) => {
    const user = findUserById(m.user_id)!;
    return {
      user_id: m.user_id,
      name: user.name,
      profile_image_url: user.profile_image_url
    };
  });

  const labels = repo.findCardLabels(card.id).map((cl) => {
    const label = repo.findLabelById(cl.label_id)!;
    return { label_id: label.id, label_name: label.label_name, label_color: label.label_color };
  });

  const attachments = repo.findAttachmentsByCardId(card.id);

  return { ...toCardDto(card), members, labels, attachments };
}

function toCommentDto(commentId: string) {
  const c = repo.findCommentById(commentId)!;
  const user = findUserById(c.user_id)!;
  return {
    id: c.id,
    card_id: c.card_id,
    author: { user_id: c.user_id, name: user.name, profile_image_url: user.profile_image_url },
    comment_str: c.comment_str,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function getCardOrThrow(cardId: string): CardRecord {
  const card = repo.findCardById(cardId);
  if (!card) throw new AppError(404, 'Card not found');
  return card;
}

function getListOrThrow(listId: string): ListRecord {
  const list = repo.findListById(listId);
  if (!list) throw new AppError(404, 'List not found');
  return list;
}

function requireCardAccess(card: CardRecord, userId: string): void {
  if (card.list_id === null) {
    if (card.user_id !== userId) throw new AppError(403, 'Access denied');
    return;
  }
  const list = getListOrThrow(card.list_id);
  if (!workspaceRepo.findMember(list.workspace_id, userId)) {
    throw new AppError(403, 'Not a member of this workspace');
  }
}

// Fractional-indexing midpoint for reorder/move operations
function computeSequence(
  siblings: CardRecord[],
  beforeId?: string | null,
  afterId?: string | null,
): number {
  const before = beforeId ? siblings.find((c) => c.id === beforeId) : null;
  const after = afterId ? siblings.find((c) => c.id === afterId) : null;
  if (!before && !after) return (siblings[siblings.length - 1]?.sequence ?? 0) + 1;
  if (!before) return after!.sequence - 1;
  if (!after) return before.sequence + 1;
  return (before.sequence + after.sequence) / 2;
}

// ─── Cards ────────────────────────────────────────────────────

export function createCard(
  userId: string,
  listId: string,
  data: {
    title: string;
    description?: string | null;
    start_at?: string | null;
    deadline?: string | null;
  },
) {
  if (userId === "") {
    const list = getListOrThrow(listId);
    if (!workspaceRepo.findMember(list.workspace_id, userId)) {
      throw new AppError(403, 'Not a member of this workspace');
    }
    return toCardDto(repo.createCard({ list_id: listId, user_id: null, ...data }));
  } else {
    return toCardDto(repo.createCard({ user_id: userId, list_id: null, ...data }));
  }
}

export function getCard(userId: string, cardId: string) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  return buildCardDetail(card);
}

export function updateCard(
  userId: string,
  cardId: string,
  data: { title?: string; description?: string | null },
) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  return toCardDto(repo.updateCard(cardId, data)!);
}

export function deleteCard(userId: string, cardId: string) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  repo.deleteCard(cardId);
}

export function reorderCard(
  userId: string,
  cardId: string,
  data: { before_card_id?: string | null; after_card_id?: string | null },
) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  if (!card.list_id) throw new AppError(400, 'Cannot reorder inbox cards');

  const siblings = repo
    .findCardsByListId(card.list_id)
    .filter((c) => c.id !== cardId)
    .sort((a, b) => a.sequence - b.sequence);

  const newSeq = computeSequence(siblings, data.before_card_id, data.after_card_id);
  return toCardDto(repo.updateCardSequence(cardId, newSeq)!);
}

export function moveCard(
  userId: string,
  cardId: string,
  data: {
    list_id: string;
    before_card_id?: string | null;
    after_card_id?: string | null;
  },
) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);

  const targetList = getListOrThrow(data.list_id);
  if (!workspaceRepo.findMember(targetList.workspace_id, userId)) {
    throw new AppError(403, 'Target list is in a workspace you are not a member of');
  }

  repo.moveCard(cardId, data.list_id);

  const siblings = repo
    .findCardsByListId(data.list_id)
    .filter((c) => c.id !== cardId)
    .sort((a, b) => a.sequence - b.sequence);

  const newSeq = computeSequence(siblings, data.before_card_id, data.after_card_id);
  return toCardDto(repo.updateCardSequence(cardId, newSeq)!);
}

export function updateCardDates(
  userId: string,
  cardId: string,
  data: { start_at?: string | null; deadline?: string | null },
) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);

  const newStart = 'start_at' in data ? data.start_at : card.start_at;
  const newEnd = 'deadline' in data ? data.deadline : card.deadline;
  if (newStart && newEnd && new Date(newStart) > new Date(newEnd)) {
    throw new AppError(400, 'start_at must be before or equal to deadline');
  }

  return toCardDto(repo.updateCardDates(cardId, data)!);
}

export function moveCardToInbox(userId: string, cardId: string) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  const updated = repo.moveCard(cardId, null)!;
  updated.user_id = userId;
  return toCardDto(updated);
}

// ─── Card Members ─────────────────────────────────────────────

export function addCardMember(userId: string, cardId: string, targetUserId: string) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);

  if (card.list_id) {
    const list = getListOrThrow(card.list_id);
    if (!workspaceRepo.findMember(list.workspace_id, targetUserId)) {
      throw new AppError(400, 'Target user is not a member of this workspace');
    }
  }

  if (repo.findCardMember(cardId, targetUserId)) {
    throw new AppError(409, 'User is already assigned to this card');
  }

  repo.addCardMember(cardId, targetUserId);
  const user = findUserById(targetUserId);
  if (!user) throw new AppError(404, 'User not found');
  return { user_id: targetUserId, name: user.name, profile_image_url: user.profile_image_url };
}

export function removeCardMember(userId: string, cardId: string, targetUserId: string) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  if (!repo.findCardMember(cardId, targetUserId)) {
    throw new AppError(404, 'Member not found on this card');
  }
  repo.removeCardMember(cardId, targetUserId);
}

// ─── Attachments ──────────────────────────────────────────────

export function addAttachment(
  userId: string,
  cardId: string,
  data: { file_url: string; file_name: string },
) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  return repo.addAttachment({ card_id: cardId, ...data });
}

export function removeAttachment(userId: string, attachmentId: string) {
  const attachment = repo.findAttachmentById(attachmentId);
  if (!attachment) throw new AppError(404, 'Attachment not found');
  const card = getCardOrThrow(attachment.card_id);
  requireCardAccess(card, userId);
  repo.removeAttachment(attachmentId);
}

// ─── Comments ─────────────────────────────────────────────────

export function createComment(userId: string, cardId: string, data: { comment_str: string }) {
  const card = getCardOrThrow(cardId);
  requireCardAccess(card, userId);
  repo.createComment({ card_id: cardId, user_id: userId, comment_str: data.comment_str });
  return toCommentDto(repo.findCommentsByCardId(cardId).at(-1)!.id);
}

export function updateComment(userId: string, commentId: string, data: { comment_str: string }) {
  const comment = repo.findCommentById(commentId);
  if (!comment) throw new AppError(404, 'Comment not found');
  if (comment.user_id !== userId) throw new AppError(403, 'Only the author can edit this comment');
  repo.updateComment(commentId, data.comment_str);
  return toCommentDto(commentId);
}

export function deleteComment(userId: string, commentId: string) {
  const comment = repo.findCommentById(commentId);
  if (!comment) throw new AppError(404, 'Comment not found');
  if (comment.user_id !== userId) {
    const card = getCardOrThrow(comment.card_id);
    if (card.list_id) {
      const list = getListOrThrow(card.list_id);
      const member = workspaceRepo.findMember(list.workspace_id, userId);
      if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
        throw new AppError(403, 'Only the author or workspace ADMIN/OWNER can delete this comment');
      }
    } else {
      throw new AppError(403, 'Only the author can delete this comment');
    }
  }
  repo.deleteComment(commentId);
}
