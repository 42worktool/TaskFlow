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

    const firstModule = await import('./auth')
    firstModule.authState.initialized = true
    firstModule.authState.user = session.user
    firstModule.authState.accessToken = session.access_token
    await firstModule.logout()

    vi.resetModules()
    const reloadedModule = await import('./auth')
    await reloadedModule.initializeAuth()

    expect(reloadedModule.authState.user).toBeNull()
    expect(reloadedModule.authState.accessToken).toBeNull()
    expect(reloadedModule.authState.initialized).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.any(Object),
    )
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

    const firstModule = await import('./auth')
    await firstModule.loginWithPassword('user@example.com', 'password')
    expect(storage.getItem('ft.auth.explicit-logout')).toBeNull()

    vi.resetModules()
    const reloadedModule = await import('./auth')
    await reloadedModule.initializeAuth()

    expect(reloadedModule.authState.user).toEqual(session.user)
    expect(reloadedModule.authState.accessToken).toBe(session.access_token)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.any(Object),
    )
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

    const { authState, getAccessToken, logout } = await import('./auth')
    const pendingToken = getAccessToken()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await logout()
    expect(refreshSignal?.aborted).toBe(true)

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

    const {
      authState,
      getAccessToken,
      loginWithPassword,
    } = await import('./auth')
    await loginWithPassword('user@example.com', 'password')

    await expect(getAccessToken(true)).rejects.toThrow(
      '인증 세션을 갱신하지 못했습니다.',
    )
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

    const {
      authFetch,
      authState,
      loginWithPassword,
      logout,
    } = await import('./auth')
    await loginWithPassword('user@example.com', 'password')
    const pendingRequest = authFetch('/api/protected')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/protected',
        expect.any(Object),
      ),
    )

    await logout()
    apiResponse.resolve(new Response(null, { status: 401 }))

    await expect(pendingRequest).resolves.toMatchObject({ status: 401 })
    expect(authState.accessToken).toBeNull()
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input) === '/api/auth/refresh'),
    ).toHaveLength(0)
  })

  it('lets the latest login attempt win regardless of response order', async () => {
    const firstResponse = deferred<Response>()
    const secondResponse = deferred<Response>()
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { email: string }
        return body.email === 'first@example.com'
          ? firstResponse.promise
          : secondResponse.promise
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const { authState, loginWithPassword } = await import('./auth')
    const firstLogin = loginWithPassword('first@example.com', 'password')
    const secondLogin = loginWithPassword('second@example.com', 'password')

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

    const { apiRequest, authState } = await import('./auth')
    authState.initialized = true

    await expect(
      apiRequest('/api/friends/requests', { method: 'POST' }),
    ).rejects.toThrow('이미 친구인 사용자입니다.')
  })
})
