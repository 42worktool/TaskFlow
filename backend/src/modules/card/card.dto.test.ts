import assert from 'node:assert/strict'
import test from 'node:test'
import type { Attachment, Card, Comment } from '@prisma/client'
import {
  toAttachmentDto,
  toCardDetailDto,
  toCardDto,
  toCommentDto,
} from './card.dto'

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
  })

  const attachment = {
    id: 'attachment-id',
    card_id: 'card-id',
    file_url: null,
    file_name: null,
    created_at: timestamp,
    created_by: null,
    updated_at: timestamp,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  } satisfies Attachment
  assert.equal(toAttachmentDto(attachment).file_url, null)
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
  const detail = toCardDetailDto(card, [member], [label], [], [comment])
  assert.deepEqual(detail.members[0], {
    user_id: 'user-id',
    name: 'User',
    profile_image_url: null,
  })
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
