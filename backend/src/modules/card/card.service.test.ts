import assert from 'node:assert/strict'
import test from 'node:test'
import type { Card, List } from '@prisma/client'
import { setRequiredEnvironment, stubMethod } from '../../test/helpers'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const CARD_ID = '00000000-0000-4000-8000-000000000002'
const SOURCE_LIST_ID = '00000000-0000-4000-8000-000000000003'
const TARGET_LIST_ID = '00000000-0000-4000-8000-000000000004'
const SOURCE_WORKSPACE_ID = '00000000-0000-4000-8000-000000000005'
const TARGET_WORKSPACE_ID = '00000000-0000-4000-8000-000000000006'

function card(overrides: Partial<Card> = {}): Card {
  const now = new Date('2026-07-27T00:00:00.000Z')
  return {
    id: CARD_ID,
    list_id: SOURCE_LIST_ID,
    user_id: null,
    title: 'Card',
    description: '',
    start_at: null,
    deadline: null,
    sequence: 1,
    created_at: now,
    created_by: USER_ID,
    updated_at: now,
    updated_by: USER_ID,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  }
}

function list(id: string, workspaceId: string): List {
  const now = new Date('2026-07-27T00:00:00.000Z')
  return {
    id,
    workspace_id: workspaceId,
    name: 'List',
    sequence: 1,
    is_done: false,
    created_at: now,
    created_by: USER_ID,
    updated_at: now,
    updated_by: USER_ID,
    deleted_at: null,
    deleted_by: null,
  }
}

test('moveCard rejects a target list in another workspace', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () => card())
  stubMethod(t, prisma.list, 'findFirst', async (args) => {
    const id = (args as { where: { id: string } }).where.id
    return (id === SOURCE_LIST_ID
      ? list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID)
      : list(TARGET_LIST_ID, TARGET_WORKSPACE_ID))
  })
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  let findManyCalls = 0
  let updateCalls = 0
  stubMethod(t, prisma.card, 'findMany', async () => {
    findManyCalls += 1
    return []
  })
  stubMethod(t, prisma.card, 'update', async () => {
    updateCalls += 1
    return card()
  })

  await assert.rejects(
    () => moveCard({
      userId: USER_ID,
      cardId: CARD_ID,
      targetListId: TARGET_LIST_ID,
    }),
    /Cards cannot be moved between workspaces/,
  )
  assert.equal(findManyCalls, 0)
  assert.equal(updateCalls, 0)
})

test('moveCard allows a member to move a card within its workspace', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () => card())
  stubMethod(t, prisma.list, 'findFirst', async (args) => {
    const id = (args as { where: { id: string } }).where.id
    return list(id, SOURCE_WORKSPACE_ID)
  })
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  stubMethod(t, prisma.card, 'findMany', async () => [])

  let update: unknown
  stubMethod(t, prisma.card, 'update', async (args) => {
    update = args
    return card({ list_id: TARGET_LIST_ID, sequence: 1 })
  })

  const moved = await moveCard({
    userId: USER_ID,
    cardId: CARD_ID,
    targetListId: TARGET_LIST_ID,
  })

  assert.equal(moved.list_id, TARGET_LIST_ID)
  assert.deepEqual(update, {
    where: { id: CARD_ID },
    data: {
      list_id: TARGET_LIST_ID,
      sequence: 1,
      updated_by: USER_ID,
    },
  })
})

test('moveCard rejects viewers before mutating a card', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () => card())
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'VIEWER' }))

  let updateCalls = 0
  stubMethod(t, prisma.card, 'update', async () => {
    updateCalls += 1
    return card()
  })

  await assert.rejects(
    () => moveCard({
      userId: USER_ID,
      cardId: CARD_ID,
      targetListId: TARGET_LIST_ID,
    }),
    /Forbidden/,
  )
  assert.equal(updateCalls, 0)
})

test('getCard includes active labels in its detail response', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { getCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () =>
    card({ list_id: null, user_id: USER_ID }))
  stubMethod(t, prisma.cardMember, 'findMany', async () => [])
  let labelQuery: unknown
  stubMethod(t, prisma.cardLabel, 'findMany', async (args) => {
    labelQuery = args
    return [{
      label: {
        id: '00000000-0000-4000-8000-000000000007',
        label_name: 'Urgent',
        label_color: '#ef4444',
      },
    }]
  })
  stubMethod(t, prisma.attachment, 'findMany', async () => [])

  const detail = await getCard({ userId: USER_ID, cardId: CARD_ID })

  assert.deepEqual(detail.labels, [{
    label_id: '00000000-0000-4000-8000-000000000007',
    label_name: 'Urgent',
    label_color: '#ef4444',
  }])
  assert.deepEqual(labelQuery, {
    where: {
      card_id: CARD_ID,
      deleted_at: null,
      label: { deleted_at: null },
    },
    orderBy: { created_at: 'asc' },
    include: {
      label: {
        select: { id: true, label_name: true, label_color: true },
      },
    },
  })
})
