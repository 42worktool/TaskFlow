// 세션 생명주기와 토큰 갱신 경쟁, 로그아웃 경계, API 오류 매핑을 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

const session = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Realtime User',
    profile_image_url: null,
    headline: '안녕하세요',
    linkedin_url: null,
    created_at: '2026-07-28T00:00:00.000Z',
    auth_provider: 'password' as const,
  },
  access_token: 'late-access-token',
  token_type: 'Bearer' as const,
  expires_in: 900,
}

describe('auth session generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('treats a missing refresh cookie as an anonymous session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    )

    const { authState, initializeAuth } = await import('../../src/services/auth')
    await initializeAuth()

    expect(authState.user).toBeNull()
    expect(authState.accessToken).toBeNull()
    expect(authState.initialized).toBe(true)
  })

  it('does not restore an explicitly logged-out session after a reload', async () => {
    const storage = memoryStorage()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/logout') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      throw new Error(`Refresh must not run after logout: ${String(input)}`)
    })
    vi.stubGlobal('window', { localStorage: storage })
    vi.stubGlobal('fetch', fetchMock)

    // 로그아웃 표시는 유지한 채 모듈을 새로 불러와 브라우저 새로고침을 재현한다.
    const firstModule = await import('../../src/services/auth')
    firstModule.authState.initialized = true
    firstModule.authState.user = session.user
    firstModule.authState.accessToken = session.access_token
    await firstModule.logout()

    vi.resetModules()
    const reloadedModule = await import('../../src/services/auth')
    await reloadedModule.initializeAuth()

    expect(reloadedModule.authState.user).toBeNull()
    expect(reloadedModule.authState.accessToken).toBeNull()
    expect(reloadedModule.authState.initialized).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object))
  })

  it('allows a successful login after an explicit logout', async () => {
    const storage = memoryStorage()
    storage.setItem('ft.auth.explicit-logout', '1')
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/login') {
        return Promise.resolve(
          new Response(JSON.stringify(session), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (String(input) === '/api/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify(session), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('window', { localStorage: storage })
    vi.stubGlobal('fetch', fetchMock)

    const firstModule = await import('../../src/services/auth')
    await firstModule.loginWithPassword('user@example.com', 'password')
    expect(storage.getItem('ft.auth.explicit-logout')).toBeNull()

    vi.resetModules()
    const reloadedModule = await import('../../src/services/auth')
    await reloadedModule.initializeAuth()

    expect(reloadedModule.authState.user).toEqual(session.user)
    expect(reloadedModule.authState.accessToken).toBe(session.access_token)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.any(Object))
  })

  it('does not let a late refresh response restore a logged-out session', async () => {
    const refreshResponse = deferred<Response>()
    let refreshSignal: AbortSignal | undefined
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/auth/refresh') {
        refreshSignal = init?.signal ?? undefined
        return refreshResponse.promise
      }
      if (String(input) === '/api/auth/logout') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { authState, getAccessToken, logout } = await import('../../src/services/auth')
    // 로그아웃이 먼저 세션 세대를 무효화할 수 있도록 토큰 갱신 응답을 보류한다.
    const pendingToken = getAccessToken()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await logout()
    expect(refreshSignal?.aborted).toBe(true)

    // 폐기된 요청이 성공하더라도 로그아웃한 세션을 다시 채우면 안 된다.
    refreshResponse.resolve(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(pendingToken).resolves.toBeNull()
    expect(authState.accessToken).toBeNull()
    expect(authState.user).toBeNull()
    expect(authState.initialized).toBe(true)
  })

  it('keeps the current session when a forced refresh fails transiently', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/login') {
        return Promise.resolve(
          new Response(JSON.stringify(session), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (String(input) === '/api/auth/refresh') {
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { authState, getAccessToken, loginWithPassword } = await import('../../src/services/auth')
    await loginWithPassword('user@example.com', 'password')

    await expect(getAccessToken(true)).rejects.toThrow('인증 세션을 갱신하지 못했습니다.')
    expect(authState.accessToken).toBe(session.access_token)
    expect(authState.user).toEqual(session.user)
  })

  it('does not start a refresh when an older API request returns 401 after logout', async () => {
    const apiResponse = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/login') {
        return Promise.resolve(
          new Response(JSON.stringify(session), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (String(input) === '/api/protected') return apiResponse.promise
      if (String(input) === '/api/auth/logout') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (String(input) === '/api/auth/refresh') {
        throw new Error('Refresh must not run after logout')
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { authFetch, authState, loginWithPassword, logout } =
      await import('../../src/services/auth')
    await loginWithPassword('user@example.com', 'password')
    // 인증된 세대에서 요청을 시작한 뒤, 로그아웃이 끝나고 나서야 해당 요청의 401을 전달한다.
    const pendingRequest = authFetch('/api/protected')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/protected', expect.any(Object)),
    )

    await logout()
    apiResponse.resolve(new Response(null, { status: 401 }))

    await expect(pendingRequest).resolves.toMatchObject({ status: 401 })
    expect(authState.accessToken).toBeNull()
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/auth/refresh'),
    ).toHaveLength(0)
  })

  it('lets the latest login attempt win regardless of response order', async () => {
    const firstResponse = deferred<Response>()
    const secondResponse = deferred<Response>()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { email: string }
      return body.email === 'first@example.com' ? firstResponse.promise : secondResponse.promise
    })
    vi.stubGlobal('fetch', fetchMock)

    const { authState, loginWithPassword } = await import('../../src/services/auth')
    const firstLogin = loginWithPassword('first@example.com', 'password')
    const secondLogin = loginWithPassword('second@example.com', 'password')

    // 오래된 요청부터 완료해도 응답 순서가 사용자의 최신 의도를 덮어쓰지 못하는지 확인한다.
    firstResponse.resolve(
      new Response(
        JSON.stringify({
          ...session,
          user: { ...session.user, id: 'first-user', email: 'first@example.com' },
          access_token: 'first-token',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await expect(firstLogin).rejects.toThrow('superseded')

    secondResponse.resolve(
      new Response(
        JSON.stringify({
          ...session,
          user: { ...session.user, id: 'second-user', email: 'second@example.com' },
          access_token: 'second-token',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await expect(secondLogin).resolves.toMatchObject({ id: 'second-user' })
    expect(authState.accessToken).toBe('second-token')
    expect(authState.user?.id).toBe('second-user')
  })

  it('maps application API error codes to user-facing messages', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: 'ALREADY_FRIENDS',
            message: 'you are already friends',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { apiRequest, authState } = await import('../../src/services/auth')
    authState.initialized = true

    await expect(apiRequest('/api/friends/requests', { method: 'POST' })).rejects.toMatchObject({
      message: '이미 친구인 사용자입니다.',
      cause: 'ALREADY_FRIENDS',
    })
  })
})
