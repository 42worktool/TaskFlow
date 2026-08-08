// 카드 DTO의 필드명과 null 허용 값, 중첩된 사용자 표현을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Attachment, Card, Comment } from '@prisma/client'
import {
  toAttachmentDto,
  toBoardCardLabelDto,
  toCardDetailDto,
  toCardDto,
  toCommentDto,
} from '../../../src/modules/card/card.dto'

const timestamp = new Date('2026-07-27T00:00:00Z')
const card = {
  id: 'card-id',
  list_id: null,
  user_id: 'user-id',
  title: 'Card',
  description: '',
  is_completed: false,
  start_at: null,
  deadline: timestamp,
  sequence: 1,
  created_at: timestamp,
  created_by: 'user-id',
  updated_at: timestamp,
  updated_by: 'user-id',
  deleted_at: null,
  deleted_by: null,
} satisfies Card

test('card DTOs preserve public field names and null values', () => {
  assert.deepEqual(toCardDto(card), {
    id: 'card-id',
    list_id: null,
    title: 'Card',
    description: '',
    is_completed: false,
    start_at: null,
    deadline: timestamp,
    sequence: 1,
    created_at: timestamp,
    labels: [],
  })

  const attachment = {
    id: 'attachment-id',
    card_id: 'card-id',
    file_url: null,
    file_name: 'notes.pdf',
    storage_key: 'stored-file.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    created_at: timestamp,
    created_by: null,
    updated_at: timestamp,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  } satisfies Attachment
  assert.equal(
    toAttachmentDto(attachment).file_url,
    '/api/cards/attachments/attachment-id/download',
  )
  assert.equal(toAttachmentDto(attachment).mime_type, 'application/pdf')
  assert.equal(toAttachmentDto(attachment).size_bytes, 1024)

  const legacyAttachment = {
    ...attachment,
    file_url: 'https://legacy.example.com/notes.pdf',
    storage_key: null,
  } satisfies Attachment
  assert.equal(toAttachmentDto(legacyAttachment).file_url, 'https://legacy.example.com/notes.pdf')
})

test('card detail and comment DTOs preserve nested user shapes', () => {
  const member = {
    user: { id: 'user-id', name: 'User', profile_image_url: null },
  }
  const label = {
    label: { id: 'label-id', label_name: 'Urgent', label_color: '#ef4444' },
  }
  const comment = {
    id: 'comment-id',
    card_id: 'card-id',
    user_id: 'user-id',
    comment_str: 'Hello',
    created_at: timestamp,
    created_by: 'user-id',
    updated_at: timestamp,
    updated_by: 'user-id',
    deleted_at: null,
    deleted_by: null,
    user: member.user,
  } satisfies Comment & { user: typeof member.user }
  assert.deepEqual(toBoardCardLabelDto(label), {
    label_id: 'label-id',
    label_name: 'Urgent',
    label_color: '#ef4444',
  })
  const detail = toCardDetailDto(card, [label], [], [comment])
  assert.deepEqual(detail.labels[0], {
    label_id: 'label-id',
    label_name: 'Urgent',
    label_color: '#ef4444',
  })
  assert.deepEqual(detail.comments, [toCommentDto(comment)])
  assert.deepEqual(toCommentDto(comment).author, {
    user_id: 'user-id',
    name: 'User',
    profile_image_url: null,
  })
})
