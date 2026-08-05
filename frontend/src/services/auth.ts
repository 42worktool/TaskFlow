import { reactive } from 'vue'

export interface AuthUser {
  id: string
  email: string
  name: string
  profile_image_url: string | null
  created_at: string
  auth_provider: 'password' | 'google'
}

interface RefreshResponse {
  user: AuthUser
  access_token: string
  token_type: 'Bearer'
  expires_in: number
}

interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  body?: BodyInit | null
  json?: unknown
}

const EXPLICIT_LOGOUT_KEY = 'ft.auth.explicit-logout'

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: '올바른 이메일 주소를 입력해 주세요.',
  INVALID_NAME: '이름은 2자 이상 80자 이하로 입력해 주세요.',
  INVALID_PASSWORD: '비밀번호는 8자 이상 128자 이하로 입력해 주세요.',
  EMAIL_ALREADY_REGISTERED: '이미 가입된 이메일입니다.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  LOGIN_RATE_LIMITED: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  INVALID_ORIGIN: '허용되지 않은 요청입니다. 페이지를 새로고침해 주세요.',
  USER_NOT_FOUND: '해당 이메일로 가입한 사용자를 찾을 수 없습니다.',
  CANNOT_FRIEND_SELF: '자기 자신에게 친구 요청을 보낼 수 없습니다.',
  ALREADY_FRIENDS: '이미 친구인 사용자입니다.',
  FRIEND_REQUEST_ALREADY_RECEIVED: '상대방이 먼저 보낸 요청이 있습니다. 받은 요청에서 수락해 주세요.',
  FRIEND_REQUEST_NOT_FOUND: '친구 요청을 찾을 수 없습니다. 목록을 새로고침해 주세요.',
  UNSUPPORTED_FILE_TYPE: '지원하지 않는 파일 형식입니다.',
  PAYLOAD_TOO_LARGE: '파일 용량이 너무 큽니다.',
  INVALID_FILE_NAME: '파일 이름이 올바르지 않습니다.',
}

export const authState = reactive<{
  user: AuthUser | null
  accessToken: string | null
  initialized: boolean
}>({
  user: null,
  accessToken: null,
  initialized: false,
})

let initialization: Promise<void> | null = null
let authGeneration = 0
let authAttempt = 0
let refreshInFlight: {
  generation: number
  controller: AbortController
  promise: Promise<boolean>
} | null = null

function hasExplicitLogout(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1'
    )
  } catch {
    return false
  }
}

function setExplicitLogout(value: boolean): void {
  try {
    if (typeof window === 'undefined') return
    if (value) window.localStorage.setItem(EXPLICIT_LOGOUT_KEY, '1')
    else window.localStorage.removeItem(EXPLICIT_LOGOUT_KEY)
  } catch {
    // Authentication still works when browser storage is unavailable.
  }
}

function clearAuth(): void {
  authState.user = null
  authState.accessToken = null
}

function abortRefresh(): void {
  const currentRefresh = refreshInFlight
  refreshInFlight = null
  currentRefresh?.controller.abort()
}

// Exported for account.ts's delete-account flow: clearing the session after
// the account itself is gone is a session-management concern, not something
// that belongs duplicated outside auth.ts.
export function invalidateAuthenticatedSession(): void {
  authGeneration += 1
  authAttempt += 1
  abortRefresh()
  clearAuth()
  authState.initialized = true
}

function rejectCurrentSession(expectedGeneration: number): void {
  if (expectedGeneration !== authGeneration) return
  authGeneration += 1
  authAttempt += 1
  clearAuth()
  authState.initialized = true
}

// Also used by fileTransfer.ts, whose XHR-based uploadFile has no Response
// object to pass through authRequestError and must map a manually parsed
// error body instead.
export function resolveErrorMessage(
  body: { error?: string; message?: string } | null,
  fallback: string,
): string {
  return (body?.error && AUTH_ERROR_MESSAGES[body.error]) || body?.message || fallback
}

export async function authRequestError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null
  return new Error(resolveErrorMessage(body, fallback), { cause: body?.error })
}

function applyAuthenticatedSession(
  session: RefreshResponse,
  expectedGeneration: number,
  expectedAttempt: number,
): AuthUser {
  if (
    expectedGeneration !== authGeneration ||
    expectedAttempt !== authAttempt
  ) {
    throw new Error('Authentication request was superseded by a newer session')
  }

  authGeneration += 1
  authAttempt += 1
  abortRefresh()
  setExplicitLogout(false)
  authState.user = session.user
  authState.accessToken = session.access_token
  authState.initialized = true
  return session.user
}

async function requestPasswordSession(
  path: '/api/auth/login' | '/api/auth/signup',
  payload: Record<string, string>,
  fallback: string,
): Promise<AuthUser> {
  abortRefresh()
  const generation = authGeneration
  const attempt = ++authAttempt
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw await authRequestError(response, fallback)
  return applyAuthenticatedSession(
    (await response.json()) as RefreshResponse,
    generation,
    attempt,
  )
}

async function requestRefresh(
  expectedGeneration = authGeneration,
): Promise<boolean> {
  if (expectedGeneration !== authGeneration) return false
  if (hasExplicitLogout()) {
    clearAuth()
    authState.initialized = true
    return false
  }
  const generation = expectedGeneration
  if (refreshInFlight?.generation === generation) return refreshInFlight.promise

  const controller = new AbortController()
  let promise!: Promise<boolean>

  promise = (async () => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (generation !== authGeneration || controller.signal.aborted) return false
    if (response.status === 401 || response.status === 403) {
      rejectCurrentSession(generation)
      return false
    }
    if (!response.ok) {
      throw await authRequestError(
        response,
        '인증 세션을 갱신하지 못했습니다.',
      )
    }

    const body = (await response.json()) as RefreshResponse
    if (generation !== authGeneration || controller.signal.aborted) return false
    authState.accessToken = body.access_token
    authState.user = body.user
    return true
  })()
    .catch((error: unknown) => {
      if (generation !== authGeneration || controller.signal.aborted) return false
      throw error
    })
    .finally(() => {
      if (refreshInFlight?.promise === promise) refreshInFlight = null
    })

  refreshInFlight = { generation, controller, promise }
  return promise
}

export async function initializeAuth(): Promise<void> {
  if (authState.initialized) return
  if (initialization) return initialization

  initialization = (async () => {
    try {
      await requestRefresh()
    } catch {
      clearAuth()
    }
    authState.initialized = true
  })()

  try {
    await initialization
  } finally {
    initialization = null
  }
}

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  await initializeAuth()
  if (forceRefresh && !(await requestRefresh())) return null
  return authState.accessToken
}

export function startGoogleLogin(returnTo = '/workspaces'): void {
  setExplicitLogout(false)
  const url = new URL('/api/auth/oauth/google', window.location.origin)
  url.searchParams.set('return_to', returnTo)
  window.location.assign(url.toString())
}

export async function loginWithPassword(email: string, password: string): Promise<AuthUser> {
  return requestPasswordSession('/api/auth/login', { email, password }, '로그인하지 못했습니다.')
}

export async function signupWithPassword(
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  return requestPasswordSession(
    '/api/auth/signup',
    { name, email, password },
    '회원가입을 완료하지 못했습니다.',
  )
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  await initializeAuth()
  const requestGeneration = authGeneration

  const makeRequest = () => {
    const headers = new Headers(init.headers)
    if (authState.accessToken) headers.set('Authorization', `Bearer ${authState.accessToken}`)
    return fetch(input, { ...init, headers, credentials: 'same-origin' })
  }

  let response = await makeRequest()
  if (response.status === 401 && requestGeneration === authGeneration) {
    try {
      if (
        (await requestRefresh(requestGeneration)) &&
        requestGeneration === authGeneration
      ) {
        response = await makeRequest()
      }
    } catch {
      // A transient refresh failure must not erase a still-valid local session.
    }
  }
  return response
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init: ApiRequestInit = {},
): Promise<T> {
  const { json, ...requestInit } = init
  if (json !== undefined) {
    const headers = new Headers(requestInit.headers)
    headers.set('Content-Type', 'application/json')
    requestInit.headers = headers
    requestInit.body = JSON.stringify(json)
  }

  const response = await authFetch(input, requestInit)

  if (!response.ok) {
    throw await authRequestError(
      response,
      `Request failed with status ${response.status}`,
    )
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function logout(): Promise<void> {
  setExplicitLogout(true)
  invalidateAuthenticatedSession()
  // Local invalidation happens before the request so late refresh responses
  // cannot restore the session while logout is in progress.
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
}

