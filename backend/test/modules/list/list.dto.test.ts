// 단독 목록과 보드에 중첩된 목록 표현에서 사용하는 DTO 규약을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Card, List } from '@prisma/client'
import { toBoardListDto, toListDto } from '../../../src/modules/list/list.dto'

const timestamp = new Date('2026-07-27T00:00:00Z')
const list = {
  id: 'list-id',
  workspace_id: 'workspace-id',
  name: 'Todo',
  sequence: 1,
  created_at: timestamp,
  created_by: null,
  updated_at: timestamp,
  updated_by: null,
  deleted_at: null,
  deleted_by: null,
} satisfies List

test('list DTOs expose the existing list and nested-card contracts', () => {
  assert.deepEqual(toListDto(list), {
    id: 'list-id',
    workspace_id: 'workspace-id',
    name: 'Todo',
    sequence: 1,
  })

  const card = {
    id: 'card-id',
    list_id: 'list-id',
    user_id: null,
    title: 'Card',
    description: '',
    is_completed: false,
    start_at: null,
    deadline: null,
    sequence: 1,
    created_at: timestamp,
    created_by: null,
    updated_at: timestamp,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  } satisfies Card
  assert.equal(toBoardListDto({ ...list, cards: [card] }).cards[0]?.id, 'card-id')
})
