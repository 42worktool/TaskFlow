import type { Attachment, Card, CardLabel, Comment, Label } from '@prisma/client'
import {
  toUserSummary,
  type SelectedUserSummary,
} from '../../lib/user-summary'

interface BoardCardLabel extends Pick<CardLabel, 'label_id'> {
  label: Pick<Label, 'id' | 'label_name' | 'label_color'>
}

export function toBoardCardLabelDto(cardLabel: BoardCardLabel) {
  return {
    label_id: cardLabel.label.id,
    label_name: cardLabel.label.label_name,
    label_color: cardLabel.label.label_color,
  }
}

export function toCardDto(card: Card, labels: BoardCardLabel[] = []) {
  return {
    id: card.id,
    list_id: card.list_id,
    title: card.title,
    description: card.description,
    is_completed: card.is_completed,
    start_at: card.start_at,
    deadline: card.deadline,
    sequence: card.sequence,
    created_at: card.created_at,
    labels: labels.map(toBoardCardLabelDto),
  }
}

export function toCardMemberDto(member: {
  user: SelectedUserSummary
}) {
  return toUserSummary(member.user)
}

export function toAttachmentDto(attachment: Attachment) {
  return {
    id: attachment.id,
    card_id: attachment.card_id,
    // Attachments uploaded through the file-storage flow have a storage_key
    // and are served through the authenticated download route below. Rows
    // created under the old {file_url, file_name} JSON-body flow (before file
    // uploads were stored on disk) have no storage_key; their original
    // external file_url is preserved as-is so those links keep working.
    file_url: attachment.storage_key
      ? `/api/cards/attachments/${attachment.id}/download`
      : attachment.file_url,
    file_name: attachment.file_name,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    created_at: attachment.created_at,
  }
}

type CommentWithUser = Comment & {
  user: SelectedUserSummary
}

interface CardLabelWithLabel {
  label: {
    id: string
    label_name: string
    label_color: string
  }
}

export function toCardLabelDto(cardLabel: CardLabelWithLabel) {
  return {
    label_id: cardLabel.label.id,
    label_name: cardLabel.label.label_name,
    label_color: cardLabel.label.label_color,
  }
}

export function toCommentDto(
  comment: CommentWithUser,
  deletedBy: SelectedUserSummary | null = null,
) {
  const deleted = comment.deleted_at !== null
  return {
    id: comment.id,
    card_id: comment.card_id,
    author: toUserSummary(comment.user),
    comment_str: deleted ? null : comment.comment_str,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    deleted_at: comment.deleted_at,
    deleted_by: deleted && deletedBy ? toUserSummary(deletedBy) : null,
  }
}

export function toCardDetailDto(
  card: Card,
  members: Parameters<typeof toCardMemberDto>[0][],
  labels: CardLabelWithLabel[],
  attachments: Attachment[],
  comments: CommentWithUser[],
  commentDeleters: ReadonlyMap<string, SelectedUserSummary> = new Map(),
) {
  return {
    ...toCardDto(card),
    members: members.map(toCardMemberDto),
    labels: labels.map(toCardLabelDto),
    attachments: attachments.map(toAttachmentDto),
    comments: comments.map((comment) =>
      toCommentDto(
        comment,
        comment.deleted_by
          ? commentDeleters.get(comment.deleted_by) ?? null
          : null,
      )),
  }
}
