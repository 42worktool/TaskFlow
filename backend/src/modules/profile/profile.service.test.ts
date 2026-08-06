import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000002'
const CREATED_AT = new Date('2026-08-06T00:00:00.000Z')

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

test('public profile service exposes profile fields without private account data', async (t) => {
  const [{ prisma }, profileService] = await Promise.all([
    import('../../db'),
    import('./profile.service'),
  ])

  await t.test('returns the public projection', async (t) => {
    let query: unknown
    stubMethod(t, prisma.user, 'findFirst', async (args) => {
      query = args
      return {
        id: USER_ID,
        name: '프로필 사용자',
        profile_image_url: null,
        headline: '제품을 만드는 개발자입니다.',
        linkedin_url: 'https://www.linkedin.com/in/example/',
        created_at: CREATED_AT,
      }
    })

    assert.deepEqual(await profileService.getPublicProfile(USER_ID), {
      id: USER_ID,
      name: '프로필 사용자',
      profile_image_url: null,
      headline: '제품을 만드는 개발자입니다.',
      linkedin_url: 'https://www.linkedin.com/in/example/',
      created_at: CREATED_AT.toISOString(),
    })
    assert.deepEqual(query, {
      where: { id: USER_ID, deleted_at: null },
      select: {
        id: true,
        name: true,
        profile_image_url: true,
        headline: true,
        linkedin_url: true,
        created_at: true,
      },
    })
  })

  await t.test('does not expose deleted or missing users', async (t) => {
    stubMethod(t, prisma.user, 'findFirst', async () => null)

    await assert.rejects(
      () => profileService.getPublicProfile(USER_ID),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        error.statusCode === 404,
    )
  })
})

test('public profile search matches public fields without selecting email', async (t) => {
  const [{ prisma }, profileService] = await Promise.all([
    import('../../db'),
    import('./profile.service'),
  ])
  let query: unknown
  stubMethod(t, prisma.user, 'findMany', async (args) => {
    query = args
    return [
      {
        id: USER_ID,
        name: '프로필 사용자',
        profile_image_url: null,
        headline: '제품을 만드는 개발자입니다.',
        linkedin_url: null,
        created_at: CREATED_AT,
      },
    ]
  })

  assert.deepEqual(
    await profileService.searchPublicProfiles({
      query: '제품 개발자',
      limit: 20,
      workspaceId: WORKSPACE_ID,
    }),
    [
      {
        id: USER_ID,
        name: '프로필 사용자',
        profile_image_url: null,
        headline: '제품을 만드는 개발자입니다.',
        linkedin_url: null,
        created_at: CREATED_AT.toISOString(),
      },
    ],
  )
  assert.deepEqual(query, {
    where: {
      deleted_at: null,
      memberships: {
        some: {
          workspace_id: WORKSPACE_ID,
          deleted_at: null,
          workspace: { deleted_at: null },
        },
      },
      AND: ['제품', '개발자'].map((term) => ({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { headline: { contains: term, mode: 'insensitive' } },
        ],
      })),
    },
    select: {
      id: true,
      name: true,
      profile_image_url: true,
      headline: true,
      linkedin_url: true,
      created_at: true,
    },
    orderBy: [{ name: 'asc' }, { created_at: 'desc' }],
    take: 20,
  })
})
