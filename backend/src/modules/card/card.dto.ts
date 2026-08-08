import type { Attachment, Card, CardLabel, Comment, Label } from '@prisma/client'
import { toUserSummary, type SelectedUserSummary } from '../../lib/user-summary'

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

export function toAttachmentDto(attachment: Attachment) {
  return {
    id: attachment.id,
    card_id: attachment.card_id,
    // 현재 파일 저장 흐름의 첨부는 storage_key가 있어 인증 다운로드 경로를 사용한다.
    // 과거 JSON {file_url, file_name} 방식으로 만든 행은 storage_key가 없으므로
    // 기존 외부 file_url을 유지해 이전 링크가 깨지지 않게 한다.
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

function toCardLabelDto(cardLabel: CardLabelWithLabel) {
  return {
    label_id: cardLabel.label.id,
    label_name: cardLabel.label.label_name,
    label_color: cardLabel.label.label_color,
  }
}

export function toCommentDto(comment: CommentWithUser) {
  return {
    id: comment.id,
    card_id: comment.card_id,
    author: toUserSummary(comment.user),
    comment_str: comment.comment_str,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  }
}

export function toCardDetailDto(
  card: Card,
  labels: CardLabelWithLabel[],
  attachments: Attachment[],
  comments: CommentWithUser[],
) {
  return {
    ...toCardDto(card),
    labels: labels.map(toCardLabelDto),
    attachments: attachments.map(toAttachmentDto),
    comments: comments.map(toCommentDto),
  }
}
