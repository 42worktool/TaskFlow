import { reactive } from 'vue'

export interface AuthUser {
  id: string
  email: string
  name: string
  profile_image_url: string | null
  created_at: string
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

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: '올바른 이메일 주소를 입력해 주세요.',
  INVALID_NAME: '이름은 2자 이상 80자 이하로 입력해 주세요.',
  INVALID_PASSWORD: '비밀번호는 8자 이상 128자 이하로 입력해 주세요.',
  EMAIL_ALREADY_REGISTERED: '이미 가입된 이메일입니다.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  LOGIN_RATE_LIMITED: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  INVALID_ORIGIN: '허용되지 않은 요청입니다. 페이지를 새로고침해 주세요.',
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
let refreshInFlight: Promise<boolean> | null = null

function clearAuth(): void {
  authState.user = null
  authState.accessToken = null
}

async function authRequestError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null
  return new Error(
    (body?.error && AUTH_ERROR_MESSAGES[body.error]) || body?.message || fallback,
  )
}

function applyAuthenticatedSession(session: RefreshResponse): AuthUser {
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
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw await authRequestError(response, fallback)
  return applyAuthenticatedSession((await response.json()) as RefreshResponse)
}

async function requestRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      clearAuth()
      return false
    }

    const body = (await response.json()) as RefreshResponse
    authState.accessToken = body.access_token
    authState.user = body.user
    return true
  })()

  try {
    return await refreshInFlight
  } catch {
    clearAuth()
    return false
  } finally {
    refreshInFlight = null
  }
}

export async function initializeAuth(): Promise<void> {
  if (authState.initialized) return
  if (initialization) return initialization

  initialization = (async () => {
    await requestRefresh()
    authState.initialized = true
  })()

  try {
    await initialization
  } finally {
    initialization = null
  }
}

export function startGoogleLogin(returnTo = '/workspaces'): void {
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

  const makeRequest = () => {
    const headers = new Headers(init.headers)
    if (authState.accessToken) headers.set('Authorization', `Bearer ${authState.accessToken}`)
    return fetch(input, { ...init, headers, credentials: 'same-origin' })
  }

  let response = await makeRequest()
  if (response.status === 401 && (await requestRefresh())) {
    response = await makeRequest()
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
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
  } finally {
    clearAuth()
    authState.initialized = true
  }
}

export async function updateAccount(name: string): Promise<AuthUser> {
  const user = await apiRequest<AuthUser>('/api/auth/account', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name }),
  })

  authState.user = user
  return user
}

export async function deleteAccount(): Promise<void> {
  await apiRequest<void>('/api/auth/account', { method: 'DELETE' })
  clearAuth()
  authState.initialized = true
}
