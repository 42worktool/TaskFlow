import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { Card, List } from '@prisma/client'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const CARD_ID = '00000000-0000-4000-8000-000000000002'
const SOURCE_LIST_ID = '00000000-0000-4000-8000-000000000003'
const TARGET_LIST_ID = '00000000-0000-4000-8000-000000000004'
const SOURCE_WORKSPACE_ID = '00000000-0000-4000-8000-000000000005'
const TARGET_WORKSPACE_ID = '00000000-0000-4000-8000-000000000006'

function setRequiredEnvironment(): void {
  Object.assign(process.env, {
    APP_ORIGIN: 'http://localhost:5173',
    JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/oauth/callback/google',
    REDIS_URL: 'redis://localhost:6379',
    SMTP_HOST: 'localhost',
    SMTP_USER: 'test',
    SMTP_PASS: 'test',
    SMTP_FROM: 'test@example.com',
  })
}

function stubMethod(
  t: TestContext,
  target: object,
  name: string,
  implementation: (...args: any[]) => any,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, name)
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: implementation,
  })
  t.after(() => {
    if (descriptor) Object.defineProperty(target, name, descriptor)
    else Reflect.deleteProperty(target, name)
  })
}

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

function stubMoveLocks(
  t: TestContext,
  prisma: any,
  lockedCard: { list_id: string | null; user_id: string | null },
  targetWorkspaceId: string,
): string[] {
  const lockOrder: string[] = []
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async (strings: TemplateStringsArray) => {
    const query = strings.join(' ')
    if (query.includes('FROM "Lists"')) {
      lockOrder.push('list')
      return [{
        id: TARGET_LIST_ID,
        workspace_id: targetWorkspaceId,
      }]
    }
    if (query.includes('FROM "Cards"')) {
      lockOrder.push('card')
      return [lockedCard]
    }
    throw new Error('Unexpected lock query')
  })
  return lockOrder
}

test('createCard locks an active list before inserting the card', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { createCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async () => [{ id: SOURCE_LIST_ID }])
  stubMethod(t, prisma.card, 'aggregate', async () => ({ _max: { sequence: 2 } }))

  let create: any
  stubMethod(t, prisma.card, 'create', async (args) => {
    create = args
    return card({ list_id: SOURCE_LIST_ID, sequence: 3 })
  })

  const created = await createCard({
    userId: USER_ID,
    listId: SOURCE_LIST_ID,
    title: 'Card',
  })

  assert.equal(created.sequence, 3)
  assert.equal(create.data.list_id, SOURCE_LIST_ID)
  assert.equal(create.data.sequence, 3)
})

test('createCard rejects a list deleted before its row lock', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { createCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async () => [])

  let createCalls = 0
  stubMethod(t, prisma.card, 'create', async () => {
    createCalls += 1
    return card()
  })

  await assert.rejects(
    () => createCard({
      userId: USER_ID,
      listId: SOURCE_LIST_ID,
      title: 'Card',
    }),
    /not found/i,
  )
  assert.equal(createCalls, 0)
})

test('listInboxCards returns only the signed-in user inbox cards', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { listInboxCards }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  let query: unknown
  stubMethod(t, prisma.card, 'findMany', async (args) => {
    query = args
    return [card({ list_id: null, user_id: USER_ID })]
  })

  const cards = await listInboxCards({ userId: USER_ID })

  assert.equal(cards.length, 1)
  assert.equal(cards[0]?.list_id, null)
  assert.deepEqual(query, {
    where: {
      list_id: null,
      user_id: USER_ID,
      deleted_at: null,
    },
    orderBy: { updated_at: 'desc' },
  })
})

test('moveCard rejects a target list in another workspace', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  stubMoveLocks(
    t,
    prisma,
    { list_id: SOURCE_LIST_ID, user_id: null },
    TARGET_WORKSPACE_ID,
  )
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

  stubMethod(t, prisma.list, 'findFirst', async (args) => {
    const id = (args as { where: { id: string } }).where.id
    return list(id, SOURCE_WORKSPACE_ID)
  })
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  const lockOrder = stubMoveLocks(
    t,
    prisma,
    { list_id: SOURCE_LIST_ID, user_id: null },
    SOURCE_WORKSPACE_ID,
  )
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
  assert.deepEqual(lockOrder, ['list', 'card'])
  assert.deepEqual(update, {
    where: { id: CARD_ID },
    data: {
      list_id: TARGET_LIST_ID,
      sequence: 1,
      updated_by: USER_ID,
    },
  })
})

test('moveCard rejects a target list deleted before its row lock', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async () => [])

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
    /not found/i,
  )
  assert.equal(updateCalls, 0)
})

test('moveCard detaches stale workspace relations from an inbox card', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  stubMoveLocks(
    t,
    prisma,
    { list_id: null, user_id: USER_ID },
    TARGET_WORKSPACE_ID,
  )
  stubMethod(t, prisma.card, 'findMany', async () => [])

  let memberUpdate: any
  let labelUpdate: any
  stubMethod(t, prisma.cardMember, 'updateMany', async (args) => {
    memberUpdate = args
    return { count: 1 }
  })
  stubMethod(t, prisma.cardLabel, 'updateMany', async (args) => {
    labelUpdate = args
    return { count: 1 }
  })
  stubMethod(t, prisma.card, 'update', async () =>
    card({ list_id: TARGET_LIST_ID, user_id: USER_ID }))

  await moveCard({
    userId: USER_ID,
    cardId: CARD_ID,
    targetListId: TARGET_LIST_ID,
  })

  for (const update of [memberUpdate, labelUpdate]) {
    assert.deepEqual(update.where, {
      card_id: CARD_ID,
      deleted_at: null,
    })
    assert.equal(update.data.updated_by, USER_ID)
    assert.equal(update.data.deleted_by, USER_ID)
    assert.ok(update.data.deleted_at instanceof Date)
  }
})

test('moveCardToInbox detaches workspace members and labels', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCardToInbox }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () => card())
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async () => [{
    list_id: SOURCE_LIST_ID,
    user_id: null,
  }])

  let memberUpdate: any
  let labelUpdate: any
  let cardUpdate: any
  stubMethod(t, prisma.cardMember, 'updateMany', async (args) => {
    memberUpdate = args
    return { count: 1 }
  })
  stubMethod(t, prisma.cardLabel, 'updateMany', async (args) => {
    labelUpdate = args
    return { count: 1 }
  })
  stubMethod(t, prisma.card, 'update', async (args) => {
    cardUpdate = args
    return card({ list_id: null, user_id: USER_ID })
  })

  const moved = await moveCardToInbox({
    userId: USER_ID,
    cardId: CARD_ID,
  })

  assert.equal(moved.list_id, null)
  for (const update of [memberUpdate, labelUpdate]) {
    assert.deepEqual(update.where, {
      card_id: CARD_ID,
      deleted_at: null,
    })
    assert.equal(update.data.updated_by, USER_ID)
    assert.equal(update.data.deleted_by, USER_ID)
    assert.ok(update.data.deleted_at instanceof Date)
  }
  assert.deepEqual(cardUpdate, {
    where: { id: CARD_ID },
    data: {
      list_id: null,
      user_id: USER_ID,
      updated_by: USER_ID,
    },
  })
})

test('addCardMember rejects inbox cards while holding the card lock', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { addCardMember }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async () => [{
    list_id: null,
    user_id: USER_ID,
  }])

  let createCalls = 0
  stubMethod(t, prisma.cardMember, 'create', async () => {
    createCalls += 1
    return {}
  })

  await assert.rejects(
    () => addCardMember({
      userId: USER_ID,
      cardId: CARD_ID,
      targetUserId: TARGET_WORKSPACE_ID,
    }),
    /Cannot assign members to inbox cards/,
  )
  assert.equal(createCalls, 0)
})

test('moveCard rejects viewers before mutating a card', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'VIEWER' }))
  stubMoveLocks(
    t,
    prisma,
    { list_id: SOURCE_LIST_ID, user_id: null },
    SOURCE_WORKSPACE_ID,
  )

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

test('moveCard rechecks inbox ownership after locking the card', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { moveCard }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMoveLocks(
    t,
    prisma,
    { list_id: null, user_id: TARGET_WORKSPACE_ID },
    TARGET_WORKSPACE_ID,
  )

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
