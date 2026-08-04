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
    is_completed: false,
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
  const [{ prisma }, { realtime }, { createCard }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async () => [{ id: SOURCE_LIST_ID }])
  stubMethod(t, prisma.card, 'aggregate', async () => ({ _max: { sequence: 2 } }))

  let create: any
  const operationOrder: string[] = []
  stubMethod(t, prisma.card, 'create', async (args) => {
    operationOrder.push('create')
    create = args
    return card({ list_id: SOURCE_LIST_ID, sequence: 3 })
  })
  let publication: unknown[]
  stubMethod(t, realtime, 'publish', (...args) => {
    operationOrder.push('publish')
    publication = args
  })

  const created = await createCard({
    userId: USER_ID,
    listId: SOURCE_LIST_ID,
    title: 'Card',
  })

  assert.equal(created.sequence, 3)
  assert.equal(create.data.list_id, SOURCE_LIST_ID)
  assert.equal(create.data.sequence, 3)
  assert.deepEqual(operationOrder, ['create', 'publish'])
  assert.equal(publication![0], `workspace:${SOURCE_WORKSPACE_ID}`)
  assert.equal(publication![1], 'workspace.changed')
  const event = publication![2] as {
    entity: string
    action: string
    entity_id: string
    list_ids: string[]
  }
  assert.deepEqual(
    {
      entity: event.entity,
      action: event.action,
      entity_id: event.entity_id,
      list_ids: event.list_ids,
    },
    {
      entity: 'card',
      action: 'created',
      entity_id: CARD_ID,
      list_ids: [SOURCE_LIST_ID],
    },
  )
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

test('updateCardCompletion toggles the card flag without moving lists', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { updateCardCompletion }] =
    await Promise.all([
      import('../../db'),
      import('../../realtime'),
      import('./card.service'),
    ])

  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  let storedCompleted = false
  stubMethod(t, prisma, '$queryRaw', async () => [{
    list_id: SOURCE_LIST_ID,
    user_id: null,
    is_completed: storedCompleted,
    start_at: null,
    deadline: null,
  }])
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))

  const updates: any[] = []
  stubMethod(t, prisma.card, 'update', async (args) => {
    updates.push(args)
    storedCompleted = args.data.is_completed
    return card({ is_completed: storedCompleted })
  })
  const publications: unknown[][] = []
  stubMethod(t, realtime, 'publish', (...args) => {
    publications.push(args)
  })

  const completed = await updateCardCompletion({
    userId: USER_ID,
    cardId: CARD_ID,
    isCompleted: true,
  })
  const unchanged = await updateCardCompletion({
    userId: USER_ID,
    cardId: CARD_ID,
    isCompleted: true,
  })

  assert.equal(completed.is_completed, true)
  assert.equal(unchanged.is_completed, true)
  assert.equal(completed.list_id, SOURCE_LIST_ID)
  assert.deepEqual(updates[0], {
    where: { id: CARD_ID },
    data: {
      is_completed: true,
      updated_by: USER_ID,
    },
  })
  assert.equal(publications.length, 1)
  assert.equal(publications[0]?.[0], `workspace:${SOURCE_WORKSPACE_ID}`)
  const event = publications[0]?.[2] as {
    workspace_id: string
    entity: string
    action: string
    entity_id: string
    list_ids: string[]
    actor_user_id: string
  }
  assert.deepEqual(
    {
      workspace_id: event.workspace_id,
      entity: event.entity,
      action: event.action,
      entity_id: event.entity_id,
      list_ids: event.list_ids,
      actor_user_id: event.actor_user_id,
    },
    {
      workspace_id: SOURCE_WORKSPACE_ID,
      entity: 'card',
      action: 'updated',
      entity_id: CARD_ID,
      list_ids: [SOURCE_LIST_ID],
      actor_user_id: USER_ID,
    },
  )
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

test('getCard includes active labels and comments in its detail response', async (t) => {
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
  let commentQuery: unknown
  stubMethod(t, prisma.comment, 'findMany', async (args) => {
    commentQuery = args
    const now = new Date('2026-07-27T00:00:00.000Z')
    return [{
      id: '00000000-0000-4000-8000-000000000008',
      card_id: CARD_ID,
      user_id: USER_ID,
      comment_str: 'From workspace chat',
      created_at: now,
      created_by: USER_ID,
      updated_at: now,
      updated_by: USER_ID,
      deleted_at: null,
      deleted_by: null,
      user: {
        id: USER_ID,
        name: 'User',
        profile_image_url: null,
      },
    }]
  })

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
  assert.deepEqual(detail.comments, [{
    id: '00000000-0000-4000-8000-000000000008',
    card_id: CARD_ID,
    author: {
      user_id: USER_ID,
      name: 'User',
      profile_image_url: null,
    },
    comment_str: 'From workspace chat',
    created_at: new Date('2026-07-27T00:00:00.000Z'),
    updated_at: new Date('2026-07-27T00:00:00.000Z'),
  }])
  assert.deepEqual(commentQuery, {
    where: { card_id: CARD_ID, deleted_at: null },
    orderBy: { created_at: 'asc' },
    include: {
      user: {
        select: { id: true, name: true, profile_image_url: true },
      },
    },
  })
})

test('card mutations use the locked location and publish only after commit', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, service] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./card.service'),
  ])

  const mutationCases: Array<{
    name: string
    run: () => Promise<unknown>
    action: 'updated' | 'deleted' | 'moved'
  }> = [
    {
      name: 'updateCard',
      run: () =>
        service.updateCard({
          userId: USER_ID,
          cardId: CARD_ID,
          title: 'Updated',
        }),
      action: 'updated',
    },
    {
      name: 'deleteCard',
      run: () => service.deleteCard({ userId: USER_ID, cardId: CARD_ID }),
      action: 'deleted',
    },
    {
      name: 'reorderCard',
      run: () =>
        service.reorderCard({
          userId: USER_ID,
          cardId: CARD_ID,
        }),
      action: 'moved',
    },
    {
      name: 'updateCardDates',
      run: () =>
        service.updateCardDates({
          userId: USER_ID,
          cardId: CARD_ID,
          startAt: '2026-07-28T00:00:00.000Z',
        }),
      action: 'updated',
    },
  ]

  for (const mutation of mutationCases) {
    await t.test(mutation.name, async (t) => {
      const operationOrder: string[] = []
      stubMethod(t, prisma, '$transaction', async (operation) => {
        const result = await operation(prisma)
        operationOrder.push('commit')
        return result
      })
      stubMethod(t, prisma, '$queryRaw', async () => {
        operationOrder.push('lock')
        return [{
          list_id: TARGET_LIST_ID,
          user_id: null,
          start_at: new Date('2026-07-27T00:00:00.000Z'),
          deadline: new Date('2026-07-29T00:00:00.000Z'),
        }]
      })
      stubMethod(t, prisma.card, 'findFirst', async () => {
        throw new Error('mutation must not authorize from an unlocked card read')
      })
      stubMethod(t, prisma.list, 'findFirst', async () => {
        operationOrder.push('location')
        return list(TARGET_LIST_ID, TARGET_WORKSPACE_ID)
      })
      stubMethod(t, prisma.workspaceMember, 'findFirst', async () => {
        operationOrder.push('permission')
        return { role: 'MEMBER' }
      })
      stubMethod(t, prisma.card, 'findMany', async () => [])
      stubMethod(t, prisma.card, 'update', async () => {
        operationOrder.push('write')
        return card({ list_id: TARGET_LIST_ID })
      })

      let publication: unknown[]
      stubMethod(t, realtime, 'publish', (...args) => {
        operationOrder.push('publish')
        publication = args
      })

      await mutation.run()

      assert.equal(operationOrder[0], 'lock')
      assert.ok(
        operationOrder.indexOf('permission') <
          operationOrder.indexOf('write'),
      )
      assert.ok(
        operationOrder.indexOf('write') <
          operationOrder.indexOf('commit'),
      )
      assert.ok(
        operationOrder.indexOf('commit') <
          operationOrder.indexOf('publish'),
      )
      assert.equal(publication![0], `workspace:${TARGET_WORKSPACE_ID}`)
      assert.equal(publication![1], 'workspace.changed')
      const event = publication![2] as {
        action: string
        entity_id: string
        list_ids: string[]
      }
      assert.deepEqual(
        {
          action: event.action,
          entity_id: event.entity_id,
          list_ids: event.list_ids,
        },
        {
          action: mutation.action,
          entity_id: CARD_ID,
          list_ids: [TARGET_LIST_ID],
        },
      )
    })
  }
})

test('updateCardDates validates against dates read under the card lock', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { updateCardDates }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./card.service'),
  ])

  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubMethod(t, prisma, '$queryRaw', async () => [{
    list_id: TARGET_LIST_ID,
    user_id: null,
    start_at: null,
    deadline: new Date('2026-07-29T00:00:00.000Z'),
  }])
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(TARGET_LIST_ID, TARGET_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
    role: 'MEMBER',
  }))

  let updateCalls = 0
  let publishCalls = 0
  stubMethod(t, prisma.card, 'update', async () => {
    updateCalls += 1
    return card()
  })
  stubMethod(t, realtime, 'publish', () => {
    publishCalls += 1
  })

  await assert.rejects(
    () =>
      updateCardDates({
        userId: USER_ID,
        cardId: CARD_ID,
        startAt: '2026-07-30T00:00:00.000Z',
      }),
    /start_at must be before or equal to deadline/,
  )
  assert.equal(updateCalls, 0)
  assert.equal(publishCalls, 0)
})

const ATTACHMENT_ID = '00000000-0000-4000-8000-000000000009'

function attachment(overrides: Partial<{
  id: string
  card_id: string
  file_url: string | null
  file_name: string | null
  storage_key: string | null
  mime_type: string | null
  size_bytes: number | null
}> = {}) {
  const now = new Date('2026-07-27T00:00:00.000Z')
  return {
    id: ATTACHMENT_ID,
    card_id: CARD_ID,
    file_url: null,
    file_name: 'notes.pdf',
    storage_key: 'stored-notes.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    created_at: now,
    created_by: USER_ID,
    updated_at: now,
    updated_by: USER_ID,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  }
}

function multerFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'notes.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    filename: 'stored-notes.pdf',
    size: 2048,
    destination: '',
    path: '',
    buffer: Buffer.from(''),
    stream: undefined as unknown as Express.Multer.File['stream'],
    ...overrides,
  }
}

test('addAttachment stores the uploaded file metadata for a workspace member', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { addAttachment }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () =>
    card({ list_id: SOURCE_LIST_ID }))
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  let createArgs: unknown
  stubMethod(t, prisma.attachment, 'create', async (args: { data: Record<string, unknown> }) => {
    createArgs = args
    return attachment({ ...(args.data as object) } as never)
  })
  stubMethod(t, realtime, 'publish', () => {})

  const dto = await addAttachment({
    userId: USER_ID,
    cardId: CARD_ID,
    file: multerFile(),
  })

  assert.deepEqual(createArgs, {
    data: {
      card_id: CARD_ID,
      storage_key: 'stored-notes.pdf',
      file_name: 'notes.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      created_by: USER_ID,
      updated_by: USER_ID,
    },
  })
  assert.equal(dto.file_url, `/api/cards/attachments/${ATTACHMENT_ID}/download`)
  assert.equal(dto.mime_type, 'application/pdf')
  assert.equal(dto.size_bytes, 2048)
})

test('addAttachment preserves a Korean original filename', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { addAttachment }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () =>
    card({ list_id: SOURCE_LIST_ID }))
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  let createArgs: unknown
  stubMethod(t, prisma.attachment, 'create', async (args: { data: Record<string, unknown> }) => {
    createArgs = args
    return attachment({ ...(args.data as object) } as never)
  })
  stubMethod(t, realtime, 'publish', () => {})

  const koreanName = '한글 파일명.pdf'
  await addAttachment({
    userId: USER_ID,
    cardId: CARD_ID,
    file: multerFile({ originalname: koreanName }),
  })

  assert.equal((createArgs as { data: { file_name: string } }).data.file_name, koreanName)
})

test('addAttachment rejects a viewer without write access', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { addAttachment }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.card, 'findFirst', async () =>
    card({ list_id: SOURCE_LIST_ID }))
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'VIEWER' }))

  await assert.rejects(
    () => addAttachment({ userId: USER_ID, cardId: CARD_ID, file: multerFile() }),
    /Forbidden/,
  )
})

test('getAttachmentFile resolves the on-disk path for a workspace member', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { UPLOAD_DIR }, { getAttachmentFile }] = await Promise.all([
    import('../../db'),
    import('../../lib/upload'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.attachment, 'findFirst', async () => attachment())
  stubMethod(t, prisma.card, 'findFirst', async () =>
    card({ list_id: SOURCE_LIST_ID }))
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'VIEWER' }))

  const file = await getAttachmentFile({ userId: USER_ID, attachmentId: ATTACHMENT_ID })

  assert.equal(file.absolutePath, `${UPLOAD_DIR}/attachments/stored-notes.pdf`)
  assert.equal(file.fileName, 'notes.pdf')
  assert.equal(file.mimeType, 'application/pdf')
})

test('getAttachmentFile rejects a user with no workspace membership', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { getAttachmentFile }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.attachment, 'findFirst', async () => attachment())
  stubMethod(t, prisma.card, 'findFirst', async () =>
    card({ list_id: SOURCE_LIST_ID }))
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => null)

  await assert.rejects(
    () => getAttachmentFile({ userId: USER_ID, attachmentId: ATTACHMENT_ID }),
    /Forbidden/,
  )
})

test('getAttachmentFile rejects a soft-deleted attachment', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { getAttachmentFile }] = await Promise.all([
    import('../../db'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.attachment, 'findFirst', async () => null)

  await assert.rejects(
    () => getAttachmentFile({ userId: USER_ID, attachmentId: ATTACHMENT_ID }),
    /NotFound|Resource not found/,
  )
})

test('removeAttachment soft-deletes the row', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { removeAttachment }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./card.service'),
  ])

  stubMethod(t, prisma.attachment, 'findFirst', async () => attachment())
  stubMethod(t, prisma.card, 'findFirst', async () =>
    card({ list_id: SOURCE_LIST_ID }))
  stubMethod(t, prisma.list, 'findFirst', async () =>
    list(SOURCE_LIST_ID, SOURCE_WORKSPACE_ID))
  stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({ role: 'MEMBER' }))
  let updateArgs: unknown
  stubMethod(t, prisma.attachment, 'update', async (args: unknown) => {
    updateArgs = args
    return attachment({ deleted_at: new Date('2026-07-27T00:00:00.000Z') } as never)
  })
  stubMethod(t, realtime, 'publish', () => {})

  // deleteUploadedFile() runs for real against a nonexistent path here (the
  // fixture's storage_key was never actually written to disk); it swallows
  // ENOENT internally, so this only exercises the soft-delete + permission path.
  // Direct file-cleanup coverage lives in lib/upload.test.ts.
  await removeAttachment({ userId: USER_ID, attachmentId: ATTACHMENT_ID })

  assert.deepEqual((updateArgs as { where: { id: string } }).where, { id: ATTACHMENT_ID })
})
