// 브라우저 인증 상태와 access token의 발급·갱신·폐기를 단일 생명주기로 관리한다.
// 브라우저는 HttpOnly refresh cookie를 보관하고 서버는 대응 세션 해시를 Redis에 두며,
// 화면 JavaScript는 메모리의 짧은 access token만 사용한다.
import { reactive } from 'vue'

export interface AuthUser {
  id: string
  email: string
  name: string
  profile_image_url: string | null
  headline: string
  linkedin_url: string | null
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
  USER_NOT_FOUND: '사용자를 찾을 수 없습니다.',
  CANNOT_FRIEND_SELF: '자기 자신에게 친구 요청을 보낼 수 없습니다.',
  ALREADY_FRIENDS: '이미 친구인 사용자입니다.',
  FRIEND_REQUEST_ALREADY_RECEIVED:
    '상대방이 먼저 보낸 요청이 있습니다. 받은 요청에서 수락해 주세요.',
  FRIEND_REQUEST_NOT_FOUND: '친구 요청을 찾을 수 없습니다. 목록을 새로고침해 주세요.',
  WORKSPACE_ROLE_HIERARCHY: '자신보다 낮은 역할의 구성원만 관리할 수 있습니다.',
  WORKSPACE_OWNERSHIP_TRANSFER_REQUIRED:
    '다른 구성원에게 소유권을 위임한 뒤 워크스페이스에서 나갈 수 있습니다.',
  WORKSPACE_HAS_OTHER_MEMBERS:
    '다른 구성원이 남아 있는 워크스페이스는 삭제할 수 없습니다. 소유권을 위임하거나 구성원을 먼저 정리해 주세요.',
  OWNED_WORKSPACES_REMAIN: '소유한 워크스페이스를 모두 위임하거나 삭제한 뒤 계정을 삭제해 주세요.',
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

// generation은 로그아웃 등으로 폐기된 비동기 응답이 새 세션을 덮지 못하게 하고,
// attempt는 같은 generation 안에서 더 늦게 시작한 로그인 시도만 채택하게 한다.
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
    return typeof window !== 'undefined' && window.localStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1'
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
    // 브라우저 저장소를 쓸 수 없어도 현재 탭의 인증 흐름 자체는 계속 동작한다.
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

// 계정 삭제 뒤의 세션 폐기도 인증 생명주기이므로 account.ts에서 중복 구현하지 않고
// 이 함수를 공유한다. generation을 올려 이미 진행 중인 refresh 응답까지 무효화한다.
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

// XHR 기반 업로드는 Response 객체가 없으므로 파싱한 오류 본문에도 같은 사용자 문구
// 매핑을 적용할 수 있게 메시지 해석만 별도 함수로 공개한다.
export function resolveErrorMessage(
  body: { error?: string; message?: string } | null,
  fallback: string,
): string {
  return (body?.error && AUTH_ERROR_MESSAGES[body.error]) || body?.message || fallback
}

export async function authRequestError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string
    message?: string
  } | null
  return new Error(resolveErrorMessage(body, fallback), { cause: body?.error })
}

function applyAuthenticatedSession(
  session: RefreshResponse,
  expectedGeneration: number,
  expectedAttempt: number,
): AuthUser {
  // 요청 중 로그아웃이나 다른 로그인이 시작됐다면 오래된 성공 응답을 세션으로 채택하지 않는다.
  if (expectedGeneration !== authGeneration || expectedAttempt !== authAttempt) {
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
  // 명시적 로그인은 기존 자동 refresh보다 우선하므로 먼저 진행 중인 refresh를 취소한다.
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
  return applyAuthenticatedSession((await response.json()) as RefreshResponse, generation, attempt)
}

async function requestRefresh(expectedGeneration = authGeneration): Promise<boolean> {
  if (expectedGeneration !== authGeneration) return false
  if (hasExplicitLogout()) {
    clearAuth()
    authState.initialized = true
    return false
  }
  const generation = expectedGeneration
  // 여러 API가 동시에 401을 받아도 refresh 요청은 한 번만 보내고 같은 결과를 기다린다.
  if (refreshInFlight?.generation === generation) return refreshInFlight.promise

  const controller = new AbortController()
  const promise = (async () => {
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
      throw await authRequestError(response, '인증 세션을 갱신하지 못했습니다.')
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
  // 앱 시작 시 여러 가드가 호출해도 초기 세션 확인은 하나의 Promise를 공유한다.
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

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  await initializeAuth()
  const requestGeneration = authGeneration

  const makeRequest = () => {
    const headers = new Headers(init.headers)
    if (authState.accessToken) headers.set('Authorization', `Bearer ${authState.accessToken}`)
    return fetch(input, { ...init, headers, credentials: 'same-origin' })
  }

  let response = await makeRequest()
  // 이 요청이 속한 세션이 여전히 유효할 때만 token을 갱신하고 원 요청을 한 번 재시도한다.
  if (response.status === 401 && requestGeneration === authGeneration) {
    try {
      if ((await requestRefresh(requestGeneration)) && requestGeneration === authGeneration) {
        response = await makeRequest()
      }
    } catch {
      // 일시적인 refresh 장애만으로 아직 유효할 수 있는 로컬 세션을 지우지는 않는다.
    }
  }
  return response
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init: ApiRequestInit = {},
): Promise<T> {
  // 도메인 API가 JSON 직렬화와 공통 오류 처리를 반복하지 않도록 얇은 계약으로 감싼다.
  const { json, ...requestInit } = init
  if (json !== undefined) {
    const headers = new Headers(requestInit.headers)
    headers.set('Content-Type', 'application/json')
    requestInit.headers = headers
    requestInit.body = JSON.stringify(json)
  }

  const response = await authFetch(input, requestInit)

  if (!response.ok) {
    throw await authRequestError(response, `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function logout(): Promise<void> {
  setExplicitLogout(true)
  invalidateAuthenticatedSession()
  // 서버 요청보다 로컬 세션을 먼저 폐기해 늦게 도착한 refresh 응답이 로그아웃 중
  // 사용자를 다시 로그인 상태로 되돌리는 경쟁 조건을 막는다.
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
}
