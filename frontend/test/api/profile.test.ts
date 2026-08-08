// 인증 요청에 의존하지 않고 공개 프로필을 불러오는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/auth', () => ({
  authRequestError: vi.fn(async () => new Error('프로필을 불러오지 못했습니다.')),
}))

import { ProfileAPI } from '../../src/api/profile'

describe('ProfileAPI', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads a public profile without an authenticated API wrapper', async () => {
    const profile = {
      id: 'user-1',
      name: 'Profile User',
      profile_image_url: null,
      headline: '안녕하세요',
      linkedin_url: null,
      created_at: '2026-08-06T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(ProfileAPI.get('user-1')).resolves.toEqual(profile)
    expect(fetchMock).toHaveBeenCalledWith('/api/users/user-1/profile', {
      headers: { Accept: 'application/json' },
    })
  })
})
