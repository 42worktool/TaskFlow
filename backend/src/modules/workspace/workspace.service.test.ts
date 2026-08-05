import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { Role } from '@prisma/client'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'
const OWNER_ID = '00000000-0000-4000-8000-000000000003'

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

/**
 * Stubs a method to return each of `values` in turn (repeating the last one
 * once exhausted) — for modeling a read that observes a different DB state
 * on a later call, e.g. a re-check inside a lock seeing a row that changed
 * or disappeared since an earlier, unlocked read.
 */
function stubSequence<T>(
  t: TestContext,
  target: object,
  name: string,
  values: readonly T[],
): void {
  let call = 0
  stubMethod(t, target, name, async () => {
    const value = values[Math.min(call, values.length - 1)]
    call += 1
    return value
  })
}

/**
 * Stubs the raw calls issued inside membership-transition transactions: the
 * effect-only advisory lock uses `$executeRaw`, while `lockWorkspaceRow` uses
 * `$queryRaw` because its returned row determines whether the workspace still
 * exists.
 */
function stubQueryRaw(t: TestContext, target: object, workspaceRowExists: boolean): void {
  stubMethod(t, target, '$executeRaw', async () => 1)
  stubMethod(t, target, '$queryRaw', async (strings: TemplateStringsArray) =>
    strings.join(' ').includes('FROM "Workspaces"')
      ? (workspaceRowExists ? [{ id: 'locked' }] : [])
      : [])
}

function workspace() {
  const now = new Date('2026-07-29T00:00:00.000Z')
  return {
    id: WORKSPACE_ID,
    name: 'Workspace',
    is_public: false,
    created_at: now,
    created_by: USER_ID,
    updated_at: now,
    updated_by: USER_ID,
    deleted_at: null,
    deleted_by: null,
    members: [
      {
        workspace_id: WORKSPACE_ID,
        user_id: OWNER_ID,
        role: 'OWNER' as const,
        created_at: now,
        created_by: OWNER_ID,
        updated_at: now,
        updated_by: OWNER_ID,
        deleted_at: null,
        deleted_by: null,
        user: {
          id: OWNER_ID,
          name: 'Owner',
          email: 'owner@example.com',
          profile_image_url: null,
        },
      },
    ],
  }
}

function workspaceForRoleChange(callerRole: Role, targetRole: Role) {
  const base = workspace()
  const template = base.members[0]!
  return {
    ...base,
    members: [
      {
        ...template,
        user_id: USER_ID,
        role: callerRole,
        user: {
          ...template.user,
          id: USER_ID,
          name: 'Manager',
          email: 'manager@example.com',
        },
      },
      {
        ...template,
        user_id: OWNER_ID,
        role: targetRole,
        user: {
          ...template.user,
          id: OWNER_ID,
          name: 'Target',
          email: 'target@example.com',
        },
      },
    ],
  }
}

test('public workspace reads hide member email addresses', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { getWorkspace, listWorkspaces }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace.service'),
  ])
  const publicWorkspace = { ...workspace(), is_public: true }

  await t.test('separates member and public list projections', async (t) => {
    stubMethod(t, prisma.workspace, 'findMany', async () => [publicWorkspace])

    const result = await listWorkspaces({ userId: USER_ID })

    assert.equal(
      result.my[0]?.members[0]?.user.email,
      'owner@example.com',
    )
    assert.equal(
      'email' in (result.public[0]?.members[0]?.user ?? {}),
      false,
    )
  })

  await t.test(
    'sanitizes a public detail response for a nonmember, auto-joining them as VIEWER',
    async (t) => {
      const joinedWorkspace = {
        ...publicWorkspace,
        members: [
          ...publicWorkspace.members,
          {
            workspace_id: WORKSPACE_ID,
            user_id: USER_ID,
            role: 'VIEWER' as const,
            created_at: publicWorkspace.created_at,
            created_by: USER_ID,
            updated_at: publicWorkspace.created_at,
            updated_by: USER_ID,
            deleted_at: null,
            deleted_by: null,
            user: {
              id: USER_ID,
              name: 'Visitor',
              email: 'visitor@example.com',
              profile_image_url: null,
            },
          },
        ],
      }
      // getWorkspace re-reads the workspace inside the locked transaction
      // (instead of trusting the outer snapshot) and again after writing the
      // membership, so this must reflect the DB state actually changing
      // once the membership is created — a static fixture would make the
      // post-join re-check see the same "not yet a member" state forever.
      let joined = false
      stubMethod(t, prisma.workspace, 'findFirst', async () =>
        joined ? joinedWorkspace : publicWorkspace)
      stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
      stubQueryRaw(t, prisma, true)
      stubMethod(t, prisma.workspaceMember, 'findUnique', async () => null)
      let membershipCreate: unknown
      stubMethod(t, prisma.workspaceMember, 'create', async (args) => {
        membershipCreate = args
        joined = true
        return {}
      })
      stubMethod(t, prisma.user, 'findFirst', async () => ({
        name: 'Visitor',
        profile_image_url: null,
      }))
      stubMethod(t, realtime, 'sendToUser', () => {})
      stubMethod(t, realtime, 'publish', () => {})

      const result = await getWorkspace({
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      })

      // Auto-joining makes them a real member, so the response now behaves
      // like any other member response (email included), not the sanitized
      // public-nonmember projection.
      assert.equal('email' in (result.members[0]?.user ?? {}), true)
      assert.deepEqual(
        (membershipCreate as { data: { workspace_id: string; user_id: string; role: string } })
          .data,
        {
          workspace_id: WORKSPACE_ID,
          user_id: USER_ID,
          role: 'VIEWER',
          created_by: USER_ID,
          updated_by: USER_ID,
        },
      )
    },
  )

  await t.test(
    'reports the workspace as gone if it is deleted between the read and the join, instead of crashing',
    async (t) => {
      // getWorkspace's outer findFirst still sees the (now stale) public
      // snapshot; the delete is modeled by lockWorkspaceRow's FOR UPDATE
      // check coming up empty once the row-lock is actually acquired.
      stubMethod(t, prisma.workspace, 'findFirst', async () => publicWorkspace)
      stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
      stubQueryRaw(t, prisma, false)
      let createCalls = 0
      stubMethod(t, prisma.workspaceMember, 'create', async () => {
        createCalls += 1
        return {}
      })

      await assert.rejects(
        () => getWorkspace({ userId: USER_ID, workspaceId: WORKSPACE_ID }),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'NOT_FOUND',
      )
      assert.equal(createCalls, 0)
    },
  )

  await t.test(
    'does not create a membership if the workspace turns private between the read and the join',
    async (t) => {
      const nowPrivateWorkspace = { ...publicWorkspace, is_public: false }
      stubSequence(t, prisma.workspace, 'findFirst', [publicWorkspace, nowPrivateWorkspace])
      stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
      stubQueryRaw(t, prisma, true)
      let createCalls = 0
      stubMethod(t, prisma.workspaceMember, 'create', async () => {
        createCalls += 1
        return {}
      })

      await assert.rejects(
        () => getWorkspace({ userId: USER_ID, workspaceId: WORKSPACE_ID }),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'FORBIDDEN',
      )
      assert.equal(createCalls, 0)
    },
  )

  await t.test(
    'row-locks the workspace before re-checking it, not just a plain read',
    async (t) => {
      // A plain SELECT wouldn't serialize against a concurrent updateWorkspace
      // (is_public toggle) or deleteWorkspace — both do a plain UPDATE, which
      // only blocks against another lock-taking transaction. Pin the actual
      // FOR UPDATE clause down so a future edit can't silently drop it while
      // still passing the behavioral "turns private"/"deleted" tests above
      // (which only assert on the mocked return value, not the query itself).
      stubMethod(t, prisma.workspace, 'findFirst', async () => publicWorkspace)
      stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
      const queries: string[] = []
      const executions: string[] = []
      stubMethod(t, prisma, '$executeRaw', async (strings: TemplateStringsArray) => {
        executions.push(strings.join(' '))
        return 1
      })
      stubMethod(t, prisma, '$queryRaw', async (strings: TemplateStringsArray) => {
        const query = strings.join(' ')
        queries.push(query)
        return query.includes('FROM "Workspaces"') ? [{ id: WORKSPACE_ID }] : []
      })
      stubMethod(t, prisma.workspaceMember, 'findUnique', async () => null)
      stubMethod(t, prisma.workspaceMember, 'create', async () => ({}))
      stubMethod(t, prisma.user, 'findFirst', async () => ({
        name: 'Visitor',
        profile_image_url: null,
      }))
      stubMethod(t, realtime, 'sendToUser', () => {})
      stubMethod(t, realtime, 'publish', () => {})

      await getWorkspace({ userId: USER_ID, workspaceId: WORKSPACE_ID })

      const workspaceLockQuery = queries.find((query) => query.includes('FROM "Workspaces"'))
      assert.ok(workspaceLockQuery, 'expected a raw query locking the Workspaces row')
      assert.match(workspaceLockQuery!, /FOR UPDATE/)
      assert.ok(
        executions.some((query) => query.includes('pg_advisory_xact_lock')),
        'expected an effect-only advisory lock execution',
      )
    },
  )

  await t.test('does not re-join an already active public-workspace member', async (t) => {
    stubMethod(t, prisma.workspace, 'findFirst', async () => publicWorkspace)
    let memberFindUniqueCalls = 0
    stubMethod(t, prisma.workspaceMember, 'findUnique', async () => {
      memberFindUniqueCalls += 1
      return null
    })

    const result = await getWorkspace({
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    })

    assert.equal(memberFindUniqueCalls, 0)
    assert.equal(result.members[0]?.user_id, OWNER_ID)
  })

  await t.test('keeps email in a member detail response', async (t) => {
    const memberWorkspace = {
      ...publicWorkspace,
      members: publicWorkspace.members.map((member) => ({
        ...member,
        user_id: USER_ID,
        user: {
          ...member.user,
          id: USER_ID,
        },
      })),
    }
    stubMethod(t, prisma.workspace, 'findFirst', async () => memberWorkspace)

    const result = await getWorkspace({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    })

    assert.equal(
      result.members[0]?.user.email,
      'owner@example.com',
    )
  })
})

test('racing joins to a public workspace notify only once', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { getWorkspace }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace.service'),
  ])
  const publicWorkspace = { ...workspace(), is_public: true }

  stubMethod(t, prisma.workspace, 'findFirst', async () => publicWorkspace)
  stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
  stubQueryRaw(t, prisma, true)
  stubMethod(t, prisma.user, 'findFirst', async () => ({
    name: 'Visitor',
    profile_image_url: null,
  }))

  // Models the actual race: both requests read the outer workspace snapshot
  // before either has joined (so getWorkspace calls joinPublicWorkspaceAsViewer
  // for both), but the WorkspaceMember row itself is created by the first
  // call before the second call's upsertActiveMembership looks it up —
  // exactly what the advisory lock inside upsertActiveMembership serializes
  // in production, just modeled here as two sequential calls against shared
  // mutable state instead of two literally-concurrent DB transactions.
  let memberRow: { deleted_at: Date | null } | null = null
  stubMethod(t, prisma.workspaceMember, 'findUnique', async () => memberRow)
  stubMethod(t, prisma.workspaceMember, 'create', async () => {
    memberRow = { deleted_at: null }
    return {}
  })
  stubMethod(t, prisma.workspaceMember, 'update', async () => ({}))

  const deliveries: unknown[][] = []
  stubMethod(t, realtime, 'sendToUser', (...args) => {
    deliveries.push(args)
  })
  stubMethod(t, realtime, 'publish', () => {})

  await getWorkspace({ userId: USER_ID, workspaceId: WORKSPACE_ID })
  await getWorkspace({ userId: USER_ID, workspaceId: WORKSPACE_ID })

  assert.equal(deliveries.length, 1)
})

test('workspace member role changes preserve the ownership boundary', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { changeMemberRole }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace.service'),
  ])

  for (const scenario of [
    {
      name: 'OWNER changes an eligible member to ADMIN',
      callerRole: 'OWNER',
      targetRole: 'MEMBER',
      newRole: 'ADMIN',
    },
    {
      name: 'ADMIN changes an eligible member to VIEWER',
      callerRole: 'ADMIN',
      targetRole: 'MEMBER',
      newRole: 'VIEWER',
    },
  ] as const) {
    await t.test(scenario.name, async (t) => {
      const before = workspaceForRoleChange(
        scenario.callerRole,
        scenario.targetRole,
      )
      const after = workspaceForRoleChange(
        scenario.callerRole,
        scenario.newRole,
      )
      let readCount = 0
      let updateArgs: unknown
      const publications: unknown[][] = []

      stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
      stubMethod(t, prisma.workspace, 'findFirst', async () => {
        readCount += 1
        return readCount === 1 ? before : after
      })
      stubMethod(t, prisma.workspaceMember, 'update', async (args) => {
        updateArgs = args
        return {}
      })
      stubMethod(t, realtime, 'publish', (...args) => {
        publications.push(args)
      })

      const updated = await changeMemberRole({
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        targetUserId: OWNER_ID,
        role: scenario.newRole,
      })

      assert.deepEqual(updateArgs, {
        where: {
          workspace_id_user_id: {
            workspace_id: WORKSPACE_ID,
            user_id: OWNER_ID,
          },
        },
        data: {
          role: scenario.newRole,
          updated_by: USER_ID,
        },
      })
      assert.equal(
        updated.members.find((member) => member.user_id === OWNER_ID)?.role,
        scenario.newRole,
      )
      assert.equal(publications.length, 1)
    })
  }

  for (const scenario of [
    {
      name: 'ADMIN cannot change an OWNER',
      callerRole: 'ADMIN',
      targetRole: 'OWNER',
      newRole: 'MEMBER',
    },
    {
      name: 'OWNER membership cannot be demoted through member management',
      callerRole: 'OWNER',
      targetRole: 'OWNER',
      newRole: 'ADMIN',
    },
    {
      name: 'ADMIN cannot assign OWNER through a direct service call',
      callerRole: 'ADMIN',
      targetRole: 'MEMBER',
      newRole: 'OWNER',
    },
  ] as const) {
    await t.test(scenario.name, async (t) => {
      const current = workspaceForRoleChange(
        scenario.callerRole,
        scenario.targetRole,
      )
      let updateCount = 0

      stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
      stubMethod(t, prisma.workspace, 'findFirst', async () => current)
      stubMethod(t, prisma.workspaceMember, 'update', async () => {
        updateCount += 1
        return {}
      })

      await assert.rejects(
        () =>
          changeMemberRole({
            userId: USER_ID,
            workspaceId: WORKSPACE_ID,
            targetUserId: OWNER_ID,
            role: scenario.newRole,
          }),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'FORBIDDEN',
      )
      assert.equal(updateCount, 0)
    })
  }
})

test('workspace member removal protects ADMIN and OWNER targets', async (t) => {
  setRequiredEnvironment()
  const [{ prisma }, { realtime }, { removeMember }] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace.service'),
  ])

  for (const scenario of [
    { callerRole: 'ADMIN', targetRole: 'MEMBER' },
    { callerRole: 'OWNER', targetRole: 'MEMBER' },
    { callerRole: 'ADMIN', targetRole: 'VIEWER' },
    { callerRole: 'OWNER', targetRole: 'VIEWER' },
  ] as const) {
    await t.test(
      `${scenario.callerRole} can remove a ${scenario.targetRole}`,
      async (t) => {
        const current = workspaceForRoleChange(
          scenario.callerRole,
          scenario.targetRole,
        )
        let updateCount = 0

        stubMethod(t, prisma, '$transaction', async (operation) =>
          operation(prisma),
        )
        stubMethod(t, prisma.workspace, 'findFirst', async () => current)
        stubMethod(t, prisma.workspaceMember, 'update', async () => {
          updateCount += 1
          return {}
        })
        stubMethod(t, realtime, 'publish', () => {})
        stubMethod(t, realtime, 'leaveUserChannel', () => {})

        await removeMember({
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
          targetUserId: OWNER_ID,
        })

        assert.equal(updateCount, 1)
      },
    )
  }

  for (const scenario of [
    { callerRole: 'ADMIN', targetRole: 'ADMIN' },
    { callerRole: 'OWNER', targetRole: 'ADMIN' },
    { callerRole: 'ADMIN', targetRole: 'OWNER' },
    { callerRole: 'OWNER', targetRole: 'OWNER' },
  ] as const) {
    await t.test(
      `${scenario.callerRole} cannot remove a ${scenario.targetRole}`,
      async (t) => {
        const current = workspaceForRoleChange(
          scenario.callerRole,
          scenario.targetRole,
        )
        let updateCount = 0

        stubMethod(t, prisma, '$transaction', async (operation) =>
          operation(prisma),
        )
        stubMethod(t, prisma.workspace, 'findFirst', async () => current)
        stubMethod(t, prisma.workspaceMember, 'update', async () => {
          updateCount += 1
          return {}
        })

        await assert.rejects(
          () =>
            removeMember({
              userId: USER_ID,
              workspaceId: WORKSPACE_ID,
              targetUserId: OWNER_ID,
            }),
          (error: unknown) =>
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'FORBIDDEN',
        )
        assert.equal(updateCount, 0)
      },
    )
  }
})

test('workspace invitations are one-time bearer invitations', async (t) => {
  setRequiredEnvironment()
  const [
    { prisma },
    { realtime },
    { workspaceInvitationStore },
    { acceptInvite, previewInvite },
  ] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace-invitation.store'),
    import('./workspace.service'),
  ])
  const invitation = {
    workspaceId: WORKSPACE_ID,
    role: 'MEMBER' as const,
  }

  await t.test('rejects an invalid invitation token', async (t) => {
    stubMethod(t, workspaceInvitationStore, 'preview', async () => null)
    await assert.rejects(
      () => acceptInvite({ userId: USER_ID, token: 'invalid' }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'INVITE_TOKEN_INVALID',
    )
  })

  await t.test('previews without consuming the invitation', async (t) => {
    stubMethod(t, workspaceInvitationStore, 'preview', async () => invitation)
    let takeCount = 0
    stubMethod(t, workspaceInvitationStore, 'take', async () => {
      takeCount += 1
      return invitation
    })
    stubMethod(t, prisma.workspace, 'findFirst', async () => ({
      name: 'Workspace',
      members: [],
    }))

    const preview = await previewInvite({ userId: USER_ID, token: 'token' })

    assert.deepEqual(preview, {
      workspace_name: 'Workspace',
      role: 'MEMBER',
      already_member: false,
    })
    assert.equal(takeCount, 0)
  })

  await t.test('shows OWNER as an active member', async (t) => {
    stubMethod(t, workspaceInvitationStore, 'preview', async () => invitation)
    stubMethod(t, prisma.workspace, 'findFirst', async () => ({
      name: 'Workspace',
      members: [{ role: 'OWNER' }],
    }))

    const preview = await previewInvite({ userId: USER_ID, token: 'token' })

    assert.deepEqual(preview, {
      workspace_name: 'Workspace',
      role: 'MEMBER',
      already_member: true,
      current_role: 'OWNER',
    })
  })

  await t.test('takes the token before accepting with a different account email', async (t) => {
    const operationOrder: string[] = []
    stubMethod(t, workspaceInvitationStore, 'preview', async () => {
      operationOrder.push('preview')
      return invitation
    })
    stubMethod(t, workspaceInvitationStore, 'take', async () => {
      operationOrder.push('take')
      return invitation
    })
    stubMethod(t, prisma.user, 'findFirst', async () => ({
      name: 'Other',
      profile_image_url: null,
    }))
    stubMethod(t, prisma.workspace, 'findFirst', async () => workspace())
    stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
    stubMethod(t, prisma, '$executeRaw', async () => 1)
    stubMethod(t, prisma.workspaceMember, 'findUnique', async () => null)

    let membershipCreate: unknown
    stubMethod(t, prisma.workspaceMember, 'create', async (args) => {
      operationOrder.push('membership')
      membershipCreate = args
      return {}
    })
    const deliveries: unknown[][] = []
    stubMethod(t, realtime, 'sendToUser', (...args) => {
      operationOrder.push('notification')
      deliveries.push(args)
    })

    const accepted = await acceptInvite({
      userId: USER_ID,
      token: 'token',
    })

    assert.equal(accepted.id, WORKSPACE_ID)
    assert.deepEqual(membershipCreate, {
      data: {
        workspace_id: WORKSPACE_ID,
        user_id: USER_ID,
        role: 'MEMBER',
        created_by: USER_ID,
        updated_by: USER_ID,
      },
    })
    assert.equal(deliveries.length, 1)
    assert.equal(deliveries[0]?.[0], OWNER_ID)
    assert.equal(deliveries[0]?.[1], 'notification.created')
    assert.equal(
      (deliveries[0]?.[2] as { kind?: unknown }).kind,
      'workspace.member_joined',
    )
    assert.deepEqual(operationOrder, [
      'preview',
      'take',
      'membership',
      'notification',
    ])
  })

  await t.test('keeps an active member role without taking the token', async (t) => {
    stubMethod(t, workspaceInvitationStore, 'preview', async () => invitation)
    let takeCount = 0
    stubMethod(t, workspaceInvitationStore, 'take', async () => {
      takeCount += 1
      return invitation
    })
    const activeWorkspace = workspaceForRoleChange('ADMIN', 'OWNER')
    stubMethod(t, prisma.workspace, 'findFirst', async () => activeWorkspace)
    const deliveries: unknown[][] = []
    stubMethod(t, realtime, 'sendToUser', (...args) => deliveries.push(args))

    const accepted = await acceptInvite({ userId: USER_ID, token: 'token' })

    assert.equal(accepted.id, WORKSPACE_ID)
    assert.equal(
      accepted.members.find((member) => member.user_id === USER_ID)?.role,
      'ADMIN',
    )
    assert.equal(takeCount, 0)
    assert.equal(deliveries.length, 0)
  })
})

test('workspace removal events are published before channel access is revoked', async (t) => {
  setRequiredEnvironment()
  const [
    { prisma },
    { realtime },
    { workspaceInvitationStore },
    service,
  ] = await Promise.all([
    import('../../db'),
    import('../../realtime'),
    import('./workspace-invitation.store'),
    import('./workspace.service'),
  ])

  await t.test('member removal leaves every target connection after publish', async (t) => {
    const operationOrder: string[] = []
    stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
    stubMethod(t, prisma.workspace, 'findFirst', async () => ({
      id: WORKSPACE_ID,
      members: [
        { user_id: USER_ID, role: 'ADMIN' },
        { user_id: OWNER_ID, role: 'MEMBER' },
      ],
    }))
    stubMethod(t, prisma.workspaceMember, 'update', async () => {
      operationOrder.push('update')
      return {}
    })
    stubMethod(t, realtime, 'publish', () => {
      operationOrder.push('publish')
    })
    let leaveArgs: unknown[]
    stubMethod(t, realtime, 'leaveUserChannel', (...args) => {
      operationOrder.push('leave')
      leaveArgs = args
    })

    await service.removeMember({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      targetUserId: OWNER_ID,
    })

    assert.deepEqual(operationOrder, ['update', 'publish', 'leave'])
    assert.deepEqual(leaveArgs!, [OWNER_ID, `workspace:${WORKSPACE_ID}`])
  })

  await t.test('workspace deletion clears the channel after publish', async (t) => {
    const operationOrder: string[] = []
    stubMethod(t, prisma, '$transaction', async (operation) => operation(prisma))
    stubMethod(t, prisma.workspace, 'findFirst', async () => ({
      id: WORKSPACE_ID,
      members: [{ user_id: USER_ID, role: 'OWNER' }],
    }))
    stubMethod(t, prisma.workspace, 'update', async () => {
      operationOrder.push('update')
      return {}
    })
    stubMethod(t, workspaceInvitationStore, 'discardWorkspace', async (workspaceId) => {
      operationOrder.push('discard-invitations')
      assert.equal(workspaceId, WORKSPACE_ID)
    })
    stubMethod(t, realtime, 'publish', () => {
      operationOrder.push('publish')
    })
    let clearArgs: unknown[]
    stubMethod(t, realtime, 'clearChannel', (...args) => {
      operationOrder.push('clear')
      clearArgs = args
    })

    await service.deleteWorkspace({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    })

    assert.deepEqual(operationOrder, [
      'update',
      'discard-invitations',
      'publish',
      'clear',
    ])
    assert.deepEqual(clearArgs!, [`workspace:${WORKSPACE_ID}`])
  })
})
