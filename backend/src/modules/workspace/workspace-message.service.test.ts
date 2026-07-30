import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'
const FIRST_MESSAGE_ID = '00000000-0000-4000-8000-000000000003'
const SECOND_MESSAGE_ID = '00000000-0000-4000-8000-000000000004'
const CARD_ID = '00000000-0000-4000-8000-000000000005'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000006'

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

function message(
  id: string,
  content: string,
  createdAt: string,
  cardId: string | null = null,
) {
  return {
    id,
    workspace_id: WORKSPACE_ID,
    user_id: USER_ID,
    card_id: cardId,
    content,
    created_at: new Date(createdAt),
    user: {
      id: USER_ID,
      name: 'Member',
      profile_image_url: null,
    },
  }
}

test('workspace messages require membership, return history, and deliver after create', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, service] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace-message.service'),
  ])

  await t.test('returns the latest messages oldest first', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
      role: 'VIEWER',
    }))
    let query: any
    stubMethod(t, prisma.workspaceMessage, 'findMany', async (args) => {
      query = args
      return [
        message(SECOND_MESSAGE_ID, 'second', '2026-07-29T00:00:02.000Z'),
        message(FIRST_MESSAGE_ID, 'first', '2026-07-29T00:00:01.000Z'),
      ]
    })

    const result = await service.listWorkspaceMessages({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    })

    assert.deepEqual(result.map((item) => item.id), [
      FIRST_MESSAGE_ID,
      SECOND_MESSAGE_ID,
    ])
    assert.equal(query.take, 100)
    assert.deepEqual(query.orderBy, [
      { created_at: 'desc' },
      { id: 'desc' },
    ])
  })

  await t.test('sends the persisted DTO to every active member after creation', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
      role: 'VIEWER',
    }))
    const operationOrder: string[] = []
    stubMethod(t, prisma, '$transaction', async (operation) => {
      const result = await operation(prisma)
      operationOrder.push('commit')
      return result
    })
    let create: any
    stubMethod(t, prisma.workspaceMessage, 'create', async (args) => {
      operationOrder.push('create')
      create = args
      return message(FIRST_MESSAGE_ID, 'hello', '2026-07-29T00:00:01.000Z')
    })
    let memberQuery: any
    stubMethod(t, prisma.workspaceMember, 'findMany', async (args) => {
      operationOrder.push('members')
      memberQuery = args
      return [{ user_id: USER_ID }, { user_id: OTHER_USER_ID }]
    })
    const deliveries: unknown[][] = []
    stubMethod(t, realtime, 'sendToUser', (...args) => {
      operationOrder.push(`send:${args[0]}`)
      deliveries.push(args)
    })

    const result = await service.createWorkspaceMessage({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      content: 'hello',
    })

    assert.equal(result.id, FIRST_MESSAGE_ID)
    assert.equal(result.card_id, null)
    assert.equal(create.data.card_id, null)
    assert.deepEqual(memberQuery, {
      where: {
        workspace_id: WORKSPACE_ID,
        deleted_at: null,
      },
      select: { user_id: true },
    })
    assert.deepEqual(operationOrder, [
      'create',
      'commit',
      'members',
      `send:${USER_ID}`,
      `send:${OTHER_USER_ID}`,
    ])
    assert.deepEqual(deliveries, [
      [USER_ID, 'workspace.message_created', result],
      [OTHER_USER_ID, 'workspace.message_created', result],
    ])
  })

  await t.test('creates a selected-card comment atomically and delivers after commit', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
      role: 'VIEWER',
    }))

    const operationOrder: string[] = []
    stubMethod(t, prisma, '$transaction', async (operation) => {
      const result = await operation(prisma)
      operationOrder.push('commit')
      return result
    })

    let cardLookup: any
    stubMethod(t, prisma.card, 'findFirst', async (args) => {
      operationOrder.push('card lookup')
      cardLookup = args
      return { id: CARD_ID }
    })

    let messageCreate: any
    stubMethod(t, prisma.workspaceMessage, 'create', async (args) => {
      operationOrder.push('message create')
      messageCreate = args
      return message(
        FIRST_MESSAGE_ID,
        'linked comment',
        '2026-07-29T00:00:01.000Z',
        CARD_ID,
      )
    })

    let commentCreate: any
    stubMethod(t, prisma.comment, 'create', async (args) => {
      operationOrder.push('comment create')
      commentCreate = args
      return { id: 'comment-id' }
    })

    stubMethod(t, prisma.workspaceMember, 'findMany', async (args) => {
      operationOrder.push('members')
      assert.deepEqual(args, {
        where: {
          workspace_id: WORKSPACE_ID,
          deleted_at: null,
        },
        select: { user_id: true },
      })
      return [{ user_id: USER_ID }]
    })

    const deliveries: unknown[][] = []
    stubMethod(t, realtime, 'sendToUser', (...args) => {
      operationOrder.push(args[1] as string)
      deliveries.push(args)
    })

    const publications: unknown[][] = []
    stubMethod(t, realtime, 'publish', (...args) => {
      operationOrder.push(args[1] as string)
      publications.push(args)
    })

    const result = await service.createWorkspaceMessage({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      content: 'linked comment',
      cardId: CARD_ID,
    })

    assert.equal(result.card_id, CARD_ID)
    assert.deepEqual(cardLookup.where, {
      id: CARD_ID,
      deleted_at: null,
      list: {
        workspace_id: WORKSPACE_ID,
        deleted_at: null,
        workspace: { deleted_at: null },
      },
    })
    assert.deepEqual(messageCreate.data, {
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      card_id: CARD_ID,
      content: 'linked comment',
    })
    assert.deepEqual(commentCreate.data, {
      card_id: CARD_ID,
      user_id: USER_ID,
      comment_str: 'linked comment',
      created_by: USER_ID,
      updated_by: USER_ID,
    })
    assert.deepEqual(operationOrder, [
      'card lookup',
      'message create',
      'comment create',
      'commit',
      'members',
      'workspace.message_created',
      'workspace.changed',
    ])
    assert.deepEqual(deliveries, [
      [USER_ID, 'workspace.message_created', result],
    ])
    assert.equal(publications.length, 1)
    assert.equal(publications[0]?.[0], `workspace:${WORKSPACE_ID}`)
    assert.equal(publications[0]?.[1], 'workspace.changed')
    const cardEvent = publications[0]?.[2] as {
      workspace_id: string
      entity: string
      action: string
      entity_id: string
      list_ids: string[]
      actor_user_id: string
    }
    assert.deepEqual(
      {
        workspace_id: cardEvent.workspace_id,
        entity: cardEvent.entity,
        action: cardEvent.action,
        entity_id: cardEvent.entity_id,
        list_ids: cardEvent.list_ids,
        actor_user_id: cardEvent.actor_user_id,
      },
      {
        workspace_id: WORKSPACE_ID,
        entity: 'card',
        action: 'updated',
        entity_id: CARD_ID,
        list_ids: [],
        actor_user_id: USER_ID,
      },
    )
  })

  await t.test('rejects a card outside the active workspace before writing', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
      role: 'VIEWER',
    }))
    stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
    stubMethod(t, prisma.card, 'findFirst', async () => null)

    let messageCreates = 0
    let commentCreates = 0
    let deliveries = 0
    let publications = 0
    stubMethod(t, prisma.workspaceMessage, 'create', async () => {
      messageCreates += 1
    })
    stubMethod(t, prisma.comment, 'create', async () => {
      commentCreates += 1
    })
    stubMethod(t, realtime, 'sendToUser', () => {
      deliveries += 1
    })
    stubMethod(t, realtime, 'publish', () => {
      publications += 1
    })

    await assert.rejects(
      () =>
        service.createWorkspaceMessage({
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
          content: 'not allowed',
          cardId: CARD_ID,
        }),
      /not found/i,
    )
    assert.equal(messageCreates, 0)
    assert.equal(commentCreates, 0)
    assert.equal(deliveries, 0)
    assert.equal(publications, 0)
  })

  await t.test('does not deliver or publish when the linked comment write fails', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => ({
      role: 'VIEWER',
    }))
    stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
    stubMethod(t, prisma.card, 'findFirst', async () => ({ id: CARD_ID }))
    stubMethod(t, prisma.workspaceMessage, 'create', async () =>
      message(
        FIRST_MESSAGE_ID,
        'linked comment',
        '2026-07-29T00:00:01.000Z',
        CARD_ID,
      ))
    stubMethod(t, prisma.comment, 'create', async () => {
      throw new Error('comment write failed')
    })

    let deliveries = 0
    let publications = 0
    stubMethod(t, realtime, 'sendToUser', () => {
      deliveries += 1
    })
    stubMethod(t, realtime, 'publish', () => {
      publications += 1
    })

    await assert.rejects(
      () =>
        service.createWorkspaceMessage({
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
          content: 'linked comment',
          cardId: CARD_ID,
        }),
      /comment write failed/,
    )
    assert.equal(deliveries, 0)
    assert.equal(publications, 0)
  })

  await t.test('rejects a public nonmember before message access', async (t) => {
    stubMethod(t, prisma.workspaceMember, 'findFirst', async () => null)
    let reads = 0
    stubMethod(t, prisma.workspaceMessage, 'findMany', async () => {
      reads += 1
      return []
    })

    await assert.rejects(
      () =>
        service.listWorkspaceMessages({
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
        }),
      /Forbidden/,
    )
    assert.equal(reads, 0)
  })
})
