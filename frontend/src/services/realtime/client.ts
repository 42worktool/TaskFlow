// 인증된 WebSocket 연결의 수립·재연결·요청 응답·구독 복구를 담당하는 범용 클라이언트다.
// 업무 이벤트 타입은 제네릭으로 받고, 전송 신뢰성과 세션 생명주기만 이 계층에서 책임진다.
import {
  parseRealtimeAuthRefreshResult,
  parseRealtimeMessage,
  parseRealtimeReadyData,
  isRealtimeEventName,
  isRealtimeControlEvent,
  REALTIME_CLOSE_CODE,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeErrorData,
  type RealtimeMessage,
  type RealtimeReadyData,
} from './protocol'

type RealtimeConnectionState =
  'idle' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting' | 'disconnected'

export interface RealtimeClientOptions {
  tokenProvider: (forceRefresh: boolean) => Promise<string | null>
  urlFactory?: () => string
  webSocketFactory?: (url: string) => WebSocket
  reconnectBaseDelayMs?: number
  reconnectMaxDelayMs?: number
  rateLimitCooldownMs?: number
  serverUnavailableCooldownMs?: number
  requestTimeoutMs?: number
  /** 소켓 생성 후 유효한 system.ready를 받을 때까지 허용하는 시간이다. */
  handshakeTimeoutMs?: number
  authenticationRefreshLeadMs?: number
  maxOutboundMessageBytes?: number
  maxBufferedAmountBytes?: number
}

interface PendingRequest {
  event: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

interface ConnectionWaiter {
  generation: number
  promise: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
}

type EventHandler = (data: unknown) => void | Promise<void>
type ClientEventName<ClientEvents extends object> = Extract<keyof ClientEvents, string>
type RequestResult<
  ClientRequestResults extends object,
  Event extends PropertyKey,
> = Event extends keyof ClientRequestResults ? ClientRequestResults[Event] : unknown

type RealtimeSubscriptionRecovery = (ready: RealtimeReadyData) => void | Promise<void>

interface SubscriptionRecovery {
  recover: RealtimeSubscriptionRecovery
  replayedConnectionId: string | null
}

export class RealtimeRequestError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean) {
    super(message)
    this.name = 'RealtimeRequestError'
    this.code = code
    this.retryable = retryable
  }
}

type RealtimeSendErrorCode =
  | 'NOT_CONNECTED'
  | 'CONNECTION_NOT_OPEN'
  | 'INVALID_EVENT'
  | 'SERIALIZATION_FAILED'
  | 'MESSAGE_TOO_LARGE'
  | 'BACKPRESSURE'
  | 'SEND_FAILED'

export class RealtimeSendError extends Error {
  readonly code: RealtimeSendErrorCode
  readonly retryable: boolean

  constructor(code: RealtimeSendErrorCode, message: string, retryable: boolean) {
    super(message)
    this.name = 'RealtimeSendError'
    this.code = code
    this.retryable = retryable
  }
}

const DEFAULT_MAX_OUTBOUND_MESSAGE_BYTES = 64 * 1024
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000
const DEFAULT_SERVER_UNAVAILABLE_COOLDOWN_MS = 5_000
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000
const DEFAULT_AUTHENTICATION_REFRESH_LEAD_MS = 30_000
const MAX_TIMER_DELAY_MS = 2_147_483_647
const CLIENT_CLOSE_CODE = {
  PROTOCOL_ERROR: 4002,
  UNSUPPORTED_DATA: 4003,
  POLICY_REJECTED: 4008,
  MESSAGE_TOO_LARGE: 4009,
} as const
const TERMINAL_CLOSE_CODES = new Set([
  1000,
  1002,
  1003,
  1008,
  1009,
  REALTIME_CLOSE_CODE.SESSION_TERMINATED,
])

function defaultUrl(): string {
  const url = new URL('/ws', window.location.href)
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function createRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

function browserCloseCode(code: number): number {
  // WebSocket.close가 송신할 수 없는 code는 브라우저 허용 범위의 애플리케이션 code로 치환한다.
  if (Number.isInteger(code) && (code === 1000 || (code >= 3000 && code <= 4999))) {
    return code
  }
  return 4000
}

function browserCloseReason(reason: string): string {
  return new TextEncoder().encode(reason).byteLength <= 123 ? reason : 'Client disconnected'
}

export class RealtimeClient<
  ServerEvents extends object,
  ClientEvents extends object,
  ClientRequestResults extends Partial<Record<ClientEventName<ClientEvents>, unknown>> = Record<
    never,
    never
  >,
> {
  // generation은 이전 소켓의 늦은 이벤트가 새 연결 상태를 바꾸지 못하게 하는 세대 번호다.
  private readonly options: RealtimeClientOptions
  private readonly maxOutboundMessageBytes: number
  private readonly maxBufferedAmountBytes: number
  private readonly handlers = new Map<string, Set<EventHandler>>()
  private readonly stateHandlers = new Set<
    (state: RealtimeConnectionState) => void | Promise<void>
  >()
  private readonly subscriptionRecoveries = new Map<string, SubscriptionRecovery>()
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  private authenticationRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private authenticationRefreshInFlight: Promise<void> | null = null
  private reconnectAttempt = 0
  private shouldReconnect = false
  private refreshAttempted = false
  private forceRefreshOnNextConnect = false
  private connectionWaiter: ConnectionWaiter | null = null
  private currentState: RealtimeConnectionState = 'idle'
  private connectionGeneration = 0
  private openingGeneration: number | null = null
  private readyData: RealtimeReadyData | null = null
  private serverClockOffsetMs = 0

  constructor(options: RealtimeClientOptions) {
    this.options = options
    this.maxOutboundMessageBytes =
      options.maxOutboundMessageBytes ?? DEFAULT_MAX_OUTBOUND_MESSAGE_BYTES
    this.maxBufferedAmountBytes = options.maxBufferedAmountBytes ?? this.maxOutboundMessageBytes * 4

    if (
      !Number.isSafeInteger(this.maxOutboundMessageBytes) ||
      this.maxOutboundMessageBytes <= 0 ||
      !Number.isSafeInteger(this.maxBufferedAmountBytes) ||
      this.maxBufferedAmountBytes < this.maxOutboundMessageBytes
    ) {
      throw new RangeError(
        'Realtime outbound limits must be positive integers and the buffer limit must fit one maximum-sized message',
      )
    }
  }

  get state(): RealtimeConnectionState {
    return this.currentState
  }

  get isConnected(): boolean {
    return this.currentState === 'connected'
  }

  connect(): Promise<void> {
    // 동시에 여러 기능이 연결을 요구해도 하나의 waiter와 하나의 소켓 수립 과정만 공유한다.
    if (this.isConnected) return Promise.resolve()
    if (this.connectionWaiter) return this.connectionWaiter.promise

    if (!this.shouldReconnect) {
      this.shouldReconnect = true
      this.connectionGeneration += 1
      this.reconnectAttempt = 0
      this.refreshAttempted = false
      this.forceRefreshOnNextConnect = false
    }

    const generation = this.connectionGeneration
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    this.connectionWaiter = { generation, promise, resolve, reject }
    if (!this.reconnectTimer) void this.openSocket(generation)
    return promise
  }

  disconnect(code = 1000, reason = 'Client disconnected'): void {
    // 명시적 종료는 자동 재연결·구독 복구·대기 요청까지 함께 끊는 최종 상태 전환이다.
    this.shouldReconnect = false
    this.connectionGeneration += 1
    this.openingGeneration = null
    this.reconnectAttempt = 0
    this.refreshAttempted = false
    this.forceRefreshOnNextConnect = false
    this.readyData = null
    this.serverClockOffsetMs = 0
    this.subscriptionRecoveries.clear()
    this.clearReconnectTimer()
    this.clearHandshakeTimer()
    this.clearAuthenticationRefreshTimer()
    this.authenticationRefreshInFlight = null
    this.rejectConnectionWaiter(new Error(reason))
    this.rejectPendingRequests(new Error('Realtime connection closed'))

    const socket = this.socket
    this.socket = null
    if (socket) this.closeSocket(socket, code, reason)
    this.setState('disconnected')
  }

  refreshAuthentication(): Promise<void> {
    if (!this.isConnected) return this.connect()
    return this.startAuthenticationRefresh(false)
  }

  private startAuthenticationRefresh(forceHttpRefresh: boolean): Promise<void> {
    // 만료 타이머와 외부 호출이 겹쳐도 WebSocket 인증 갱신은 한 번만 진행한다.
    if (this.authenticationRefreshInFlight) {
      return this.authenticationRefreshInFlight
    }

    const generation = this.connectionGeneration
    const socket = this.socket
    const operation = this.performAuthenticationRefresh(
      forceHttpRefresh,
      generation,
      socket,
    ).finally(() => {
      if (this.authenticationRefreshInFlight === operation) {
        this.authenticationRefreshInFlight = null
      }
    })
    this.authenticationRefreshInFlight = operation
    return operation
  }

  private async performAuthenticationRefresh(
    forceHttpRefresh: boolean,
    generation: number,
    socket: WebSocket | null,
  ): Promise<void> {
    // HTTP에서 새 access token을 얻은 뒤 같은 소켓에 auth.refresh로 교체하고 다음 만료를 예약한다.
    const accessToken = await this.options.tokenProvider(forceHttpRefresh)
    if (!this.isActiveSocket(socket, generation) || !this.isConnected) return
    if (!accessToken) {
      const error = new RealtimeRequestError(
        'AUTHENTICATION_UNAVAILABLE',
        'No access token is available to refresh realtime authentication',
        false,
      )
      this.disconnect(1000, 'Authentication unavailable')
      throw error
    }

    const rawResult = await this.requestWire('auth.refresh', { accessToken })
    if (!this.isActiveSocket(socket, generation) || !this.isConnected) return

    const result = parseRealtimeAuthRefreshResult(rawResult)
    if (!result) {
      const error = new RealtimeRequestError(
        'INVALID_AUTH_REFRESH_ACK',
        'The realtime authentication refresh acknowledgment is invalid',
        false,
      )
      this.disconnect(
        CLIENT_CLOSE_CODE.PROTOCOL_ERROR,
        'Invalid authentication refresh acknowledgment',
      )
      throw error
    }

    if (this.readyData) {
      this.readyData = {
        ...this.readyData,
        accessTokenExpiresAt: result.accessTokenExpiresAt,
      }
    }
    this.scheduleAuthenticationRefresh(result.accessTokenExpiresAt, generation, socket)
  }

  on<Event extends Extract<keyof ServerEvents, string>>(
    event: Event,
    handler: (data: ServerEvents[Event]) => void | Promise<void>,
  ): () => void {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler>()
    const registration: EventHandler = (data) => handler(data as ServerEvents[Event])
    handlers.add(registration)
    this.handlers.set(event, handlers)
    return () => {
      handlers.delete(registration)
      if (handlers.size === 0 && this.handlers.get(event) === handlers) {
        this.handlers.delete(event)
      }
    }
  }

  onStateChange(handler: (state: RealtimeConnectionState) => void | Promise<void>): () => void {
    const registration = (state: RealtimeConnectionState) => handler(state)
    this.stateHandlers.add(registration)
    return () => this.stateHandlers.delete(registration)
  }

  /**
   * 일시적인 소켓 재연결 뒤에도 구독 의도를 유지한다.
   * 콜백은 인증이 끝난 각 연결에서 한 번 실행되어 기능별 subscribe를 다시 보내며,
   * 반환한 해제 함수를 호출하면 이후 연결부터 재생하지 않는다.
   */
  registerSubscriptionRecovery(key: string, recover: RealtimeSubscriptionRecovery): () => void {
    if (!key) throw new Error('Realtime subscription keys must not be empty')

    const recovery: SubscriptionRecovery = {
      recover,
      replayedConnectionId: null,
    }
    this.subscriptionRecoveries.set(key, recovery)
    if (this.readyData && this.isConnected) {
      this.replaySubscription(key, recovery, this.connectionGeneration, this.readyData)
    }

    return () => {
      if (this.subscriptionRecoveries.get(key) === recovery) {
        this.subscriptionRecoveries.delete(key)
      }
    }
  }

  send<Event extends ClientEventName<ClientEvents>>(event: Event, data: ClientEvents[Event]): void {
    this.assertConnected()
    this.assertApplicationEvent(event)
    this.sendWire({ v: REALTIME_PROTOCOL_VERSION, event, data })
  }

  request<Event extends ClientEventName<ClientEvents>>(
    event: Event,
    data: ClientEvents[Event],
  ): Promise<RequestResult<ClientRequestResults, Event>> {
    try {
      this.assertApplicationEvent(event)
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Realtime request event is invalid'),
      )
    }
    return this.requestWire(event, data) as Promise<RequestResult<ClientRequestResults, Event>>
  }

  private async openSocket(generation: number): Promise<void> {
    // 토큰 확보 → 소켓 생성 → 프로토콜 인증의 순서로 열고, 각 비동기 경계에서 세대를 확인한다.
    if (
      !this.isGenerationActive(generation) ||
      this.socket ||
      this.openingGeneration === generation
    ) {
      return
    }

    this.openingGeneration = generation
    this.setState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting')
    try {
      let accessToken: string | null
      const forceRefresh = this.forceRefreshOnNextConnect
      try {
        accessToken = await this.options.tokenProvider(forceRefresh)
      } catch {
        if (this.isGenerationActive(generation)) {
          this.forceRefreshOnNextConnect = forceRefresh
          this.scheduleReconnect(generation)
        }
        return
      }

      if (!this.isGenerationActive(generation)) return
      this.forceRefreshOnNextConnect = false
      if (!accessToken) {
        const error = new Error('No access token is available for the realtime connection')
        this.stopConnectionLifecycle(error, generation, true)
        return
      }

      let socket: WebSocket
      try {
        const url = (this.options.urlFactory ?? defaultUrl)()
        socket = this.options.webSocketFactory
          ? this.options.webSocketFactory(url)
          : new WebSocket(url)
      } catch {
        this.scheduleReconnect(generation)
        return
      }
      this.socket = socket
      this.scheduleHandshakeTimeout(socket, generation)

      socket.addEventListener('open', () => {
        if (!this.isActiveSocket(socket, generation)) return
        this.setState('authenticating')
        try {
          this.sendWire({
            v: REALTIME_PROTOCOL_VERSION,
            event: 'auth.authenticate',
            data: { accessToken },
          })
        } catch (error) {
          const sendError =
            error instanceof Error
              ? error
              : new Error('Realtime authentication message could not be sent')
          const closeCode =
            error instanceof RealtimeSendError && error.code === 'MESSAGE_TOO_LARGE'
              ? CLIENT_CLOSE_CODE.MESSAGE_TOO_LARGE
              : CLIENT_CLOSE_CODE.POLICY_REJECTED
          this.failActiveConnection(
            socket,
            generation,
            closeCode,
            'Authentication message rejected',
            sendError,
          )
        }
      })

      socket.addEventListener('message', (event) => {
        if (!this.isActiveSocket(socket, generation)) return
        if (typeof event.data !== 'string') {
          this.failActiveConnection(
            socket,
            generation,
            CLIENT_CLOSE_CODE.UNSUPPORTED_DATA,
            'Binary server messages are not supported',
            new Error('The realtime server sent a non-text message'),
          )
          return
        }
        this.handleMessage(parseRealtimeMessage(event.data), generation)
      })

      socket.addEventListener('close', (event) => {
        if (!this.isActiveSocket(socket, generation)) return
        this.socket = null
        this.readyData = null
        this.clearHandshakeTimer()
        this.clearAuthenticationRefreshTimer()
        this.authenticationRefreshInFlight = null
        this.rejectPendingRequests(new Error('Realtime connection interrupted'))

        if (!this.isGenerationActive(generation)) {
          this.setState('disconnected')
          return
        }

        // 인증 만료는 HTTP token을 한 번 강제 갱신해 즉시 재접속하되 반복 실패는 종료한다.
        if (event.code === REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED) {
          if (this.refreshAttempted) {
            this.stopConnectionLifecycle(
              new Error('Realtime authentication failed'),
              generation,
              true,
            )
            return
          }
          this.refreshAttempted = true
          this.forceRefreshOnNextConnect = true
          this.scheduleReconnect(generation, 0)
          return
        }

        // 정상 종료와 재시도로 해결되지 않는 정책·프로토콜 오류는 terminal로 처리해
        // 의도치 않은 재연결 루프를 만들지 않는다.
        if (TERMINAL_CLOSE_CODES.has(event.code)) {
          this.stopConnectionLifecycle(
            new Error(`Realtime connection closed with terminal code ${event.code}`),
            generation,
            true,
          )
          return
        }

        if (event.code === REALTIME_CLOSE_CODE.RATE_LIMITED) {
          this.scheduleReconnect(
            generation,
            this.options.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS,
          )
          return
        }

        if (event.code === 1013) {
          this.scheduleReconnect(
            generation,
            this.options.serverUnavailableCooldownMs ?? DEFAULT_SERVER_UNAVAILABLE_COOLDOWN_MS,
          )
          return
        }

        if (event.code === REALTIME_CLOSE_CODE.RESYNC_REQUIRED) {
          this.scheduleReconnect(generation)
          return
        }

        this.scheduleReconnect(generation)
      })

      socket.addEventListener('error', () => {
        this.retryActiveConnection(socket, generation, 'Realtime transport failed')
      })
    } finally {
      if (this.openingGeneration === generation) this.openingGeneration = null
    }
  }

  private handleMessage(message: RealtimeMessage | null, generation: number): void {
    // 모든 서버 프레임은 protocol 파서를 통과한 뒤 제어 응답과 업무 이벤트로 분기한다.
    if (!message) {
      this.failActiveConnection(
        this.socket,
        generation,
        CLIENT_CLOSE_CODE.PROTOCOL_ERROR,
        'Invalid realtime message',
        new Error('The realtime server sent an invalid message'),
      )
      return
    }

    if (message.event === 'system.ready') {
      const ready = parseRealtimeReadyData(message.data)
      if (!ready) {
        this.failActiveConnection(
          this.socket,
          generation,
          CLIENT_CLOSE_CODE.PROTOCOL_ERROR,
          'Invalid system.ready message',
          new Error('The realtime system.ready message is invalid'),
        )
        return
      }
      this.clearHandshakeTimer()
      this.reconnectAttempt = 0
      this.refreshAttempted = false
      this.readyData = ready
      // 클라이언트 시계 오차를 보정해 access token 갱신 타이머가 너무 늦게 울리지 않게 한다.
      this.serverClockOffsetMs = Date.parse(ready.serverTime) - Date.now()
      this.setState('connected')
      this.scheduleAuthenticationRefresh(ready.accessTokenExpiresAt, generation, this.socket)
      this.resolveConnectionWaiter(generation)
      this.replaySubscriptions(generation, ready)
    }

    if (message.requestId && message.event === 'system.ack') {
      const pending = this.takePendingRequest(message.requestId)
      if (!pending) return
      const data = message.data as { event?: unknown; result?: unknown } | undefined
      if (data?.event !== pending.event) {
        pending.reject(
          new RealtimeRequestError(
            'INVALID_ACK',
            `Realtime acknowledgment does not match "${pending.event}"`,
            false,
          ),
        )
        return
      }
      pending.resolve(data.result)
      return
    }

    if (message.event === 'system.error') {
      const candidate = message.data as Partial<RealtimeErrorData> | undefined
      const data: RealtimeErrorData = {
        code: typeof candidate?.code === 'string' ? candidate.code : 'UNKNOWN_ERROR',
        message:
          typeof candidate?.message === 'string'
            ? candidate.message
            : 'An unknown realtime error occurred',
        retryable: candidate?.retryable === true,
      }
      if (message.requestId) {
        this.takePendingRequest(message.requestId)?.reject(
          new RealtimeRequestError(data.code, data.message, data.retryable),
        )
      }
    }

    for (const handler of this.handlers.get(message.event) ?? []) {
      try {
        void Promise.resolve(handler(message.data)).catch((error: unknown) => {
          console.error(`[realtime] "${message.event}" listener failed`, error)
        })
      } catch (error) {
        console.error(`[realtime] "${message.event}" listener failed`, error)
      }
    }
  }

  private requestWire(event: string, data: unknown): Promise<unknown> {
    // requestId로 ACK/ERROR를 원 요청 Promise에 연결하고 응답 유실은 timeout으로 회수한다.
    return new Promise((resolve, reject) => {
      let requestId: string | null = null
      try {
        this.assertConnected()
        requestId = createRequestId()
        const timeoutMs = this.options.requestTimeoutMs ?? 10_000
        const timeout = setTimeout(() => {
          if (requestId) this.pendingRequests.delete(requestId)
          reject(new Error(`Realtime request "${event}" timed out`))
        }, timeoutMs)
        this.pendingRequests.set(requestId, { event, resolve, reject, timeout })
        this.sendWire({ v: REALTIME_PROTOCOL_VERSION, event, requestId, data })
      } catch (error) {
        if (requestId) this.takePendingRequest(requestId)
        reject(error instanceof Error ? error : new Error('Realtime request could not be sent'))
      }
    })
  }

  private sendWire(message: RealtimeMessage): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new RealtimeSendError('CONNECTION_NOT_OPEN', 'Realtime connection is not open', true)
    }
    if (!isRealtimeEventName(message.event)) {
      throw new RealtimeSendError(
        'INVALID_EVENT',
        `Invalid realtime event name "${message.event}"`,
        false,
      )
    }

    let serialized: string
    try {
      serialized = JSON.stringify(message)
    } catch {
      throw new RealtimeSendError(
        'SERIALIZATION_FAILED',
        'Realtime message could not be serialized',
        false,
      )
    }

    // 문자 수가 아닌 실제 UTF-8 바이트로 제한해 한글 등 다중 바이트 본문도 정확히 검사한다.
    const messageBytes = new TextEncoder().encode(serialized).byteLength
    if (messageBytes > this.maxOutboundMessageBytes) {
      throw new RealtimeSendError(
        'MESSAGE_TOO_LARGE',
        `Realtime message is ${messageBytes} bytes; limit is ${this.maxOutboundMessageBytes}`,
        false,
      )
    }

    // 네트워크가 느릴 때 브라우저 송신 버퍼가 무한히 쌓이는 대신 재시도 가능한 오류를 낸다.
    if (this.socket.bufferedAmount + messageBytes > this.maxBufferedAmountBytes) {
      throw new RealtimeSendError(
        'BACKPRESSURE',
        'Realtime outbound buffer limit would be exceeded',
        true,
      )
    }

    try {
      this.socket.send(serialized)
    } catch {
      throw new RealtimeSendError('SEND_FAILED', 'Realtime message could not be sent', true)
    }
  }

  private assertConnected(): void {
    if (!this.isConnected) {
      throw new RealtimeSendError('NOT_CONNECTED', 'Realtime client is not connected', true)
    }
  }

  private assertApplicationEvent(event: string): void {
    if (!isRealtimeEventName(event) || isRealtimeControlEvent(event)) {
      throw new RealtimeSendError(
        'INVALID_EVENT',
        isRealtimeControlEvent(event)
          ? `Realtime control event "${event}" is reserved by the protocol`
          : `Invalid realtime event name "${event}"`,
        false,
      )
    }
  }

  private scheduleReconnect(generation: number, delay?: number): void {
    if (!this.isGenerationActive(generation) || this.reconnectTimer) return
    this.reconnectAttempt += 1
    this.setState('reconnecting')

    const base = this.options.reconnectBaseDelayMs ?? 500
    const maximum = this.options.reconnectMaxDelayMs ?? 30_000
    // 지수 백오프에 jitter를 섞어 서버 복구 순간 모든 브라우저가 동시에 재접속하지 않게 한다.
    const exponentialDelay = Math.min(maximum, base * 2 ** (this.reconnectAttempt - 1))
    const jitteredDelay = exponentialDelay * (0.75 + Math.random() * 0.5)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.isGenerationActive(generation)) void this.openSocket(generation)
    }, delay ?? jitteredDelay)
  }

  private scheduleHandshakeTimeout(socket: WebSocket, generation: number): void {
    this.clearHandshakeTimer()
    const timeoutMs = this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null
      this.retryActiveConnection(socket, generation, 'Realtime handshake timed out')
    }, timeoutMs)
  }

  private scheduleAuthenticationRefresh(
    accessTokenExpiresAt: string,
    generation: number,
    socket: WebSocket | null,
  ): void {
    this.clearAuthenticationRefreshTimer()
    if (!this.isActiveSocket(socket, generation) || !this.isConnected) return

    const leadMs = Math.max(
      0,
      this.options.authenticationRefreshLeadMs ?? DEFAULT_AUTHENTICATION_REFRESH_LEAD_MS,
    )
    const serverNow = Date.now() + this.serverClockOffsetMs
    const remainingMs = Date.parse(accessTokenExpiresAt) - serverNow
    if (remainingMs <= 0) return
    // 수명이 짧은 token에도 최소 절반은 사용한 뒤 갱신해 즉시 refresh가 반복되지 않게 한다.
    const effectiveLeadMs = Math.min(leadMs, remainingMs / 2)
    const delayMs = Math.min(MAX_TIMER_DELAY_MS, Math.max(1, remainingMs - effectiveLeadMs))
    this.authenticationRefreshTimer = setTimeout(() => {
      this.authenticationRefreshTimer = null
      if (
        !this.isActiveSocket(socket, generation) ||
        !this.isConnected ||
        this.readyData?.accessTokenExpiresAt !== accessTokenExpiresAt
      ) {
        return
      }

      void this.startAuthenticationRefresh(true).catch((error: unknown) => {
        console.warn('[realtime] proactive authentication refresh failed', error)
      })
    }, delayMs)
  }

  private isGenerationActive(generation: number): boolean {
    return this.shouldReconnect && generation === this.connectionGeneration
  }

  private isActiveSocket(socket: WebSocket | null, generation: number): boolean {
    return socket !== null && socket === this.socket && generation === this.connectionGeneration
  }

  private stopConnectionLifecycle(
    error: Error,
    generation: number,
    clearSubscriptionRecoveries: boolean,
  ): void {
    if (generation !== this.connectionGeneration) return
    this.shouldReconnect = false
    this.openingGeneration = null
    this.reconnectAttempt = 0
    this.refreshAttempted = false
    this.forceRefreshOnNextConnect = false
    this.readyData = null
    this.serverClockOffsetMs = 0
    this.clearReconnectTimer()
    this.clearHandshakeTimer()
    this.clearAuthenticationRefreshTimer()
    this.authenticationRefreshInFlight = null
    if (clearSubscriptionRecoveries) this.subscriptionRecoveries.clear()
    this.rejectConnectionWaiter(error, generation)
    this.rejectPendingRequests(error)
    this.setState('disconnected')
  }

  private failActiveConnection(
    socket: WebSocket | null,
    generation: number,
    closeCode: number,
    reason: string,
    error: Error,
  ): void {
    if (!this.isActiveSocket(socket, generation) || !socket) return
    this.socket = null
    this.stopConnectionLifecycle(error, generation, true)
    this.closeSocket(socket, closeCode, reason)
  }

  private retryActiveConnection(socket: WebSocket, generation: number, reason: string): void {
    if (!this.isActiveSocket(socket, generation)) return
    this.socket = null
    this.readyData = null
    this.clearHandshakeTimer()
    this.clearAuthenticationRefreshTimer()
    this.authenticationRefreshInFlight = null
    this.rejectPendingRequests(new Error(reason))
    this.closeSocket(socket, 4000, reason)
    this.scheduleReconnect(generation)
  }

  private closeSocket(socket: WebSocket, code: number, reason: string): void {
    if (socket.readyState >= 2) return
    try {
      socket.close(browserCloseCode(code), browserCloseReason(reason))
    } catch {
      try {
        socket.close()
      } catch {
        // 로컬 생명주기는 이미 끝났으므로 최종 transport 정리는 브라우저에 맡긴다.
      }
    }
  }

  private replaySubscriptions(generation: number, ready: RealtimeReadyData): void {
    for (const [key, recovery] of this.subscriptionRecoveries) {
      this.replaySubscription(key, recovery, generation, ready)
    }
  }

  private replaySubscription(
    key: string,
    recovery: SubscriptionRecovery,
    generation: number,
    ready: RealtimeReadyData,
  ): void {
    if (
      recovery.replayedConnectionId === ready.connectionId ||
      !this.isGenerationActive(generation) ||
      !this.isConnected
    ) {
      return
    }

    recovery.replayedConnectionId = ready.connectionId
    try {
      void Promise.resolve(recovery.recover(ready)).catch((error: unknown) => {
        console.error(`[realtime] subscription "${key}" recovery failed`, error)
      })
    } catch (error) {
      console.error(`[realtime] subscription "${key}" recovery failed`, error)
    }
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private clearHandshakeTimer(): void {
    if (!this.handshakeTimer) return
    clearTimeout(this.handshakeTimer)
    this.handshakeTimer = null
  }

  private clearAuthenticationRefreshTimer(): void {
    if (!this.authenticationRefreshTimer) return
    clearTimeout(this.authenticationRefreshTimer)
    this.authenticationRefreshTimer = null
  }

  private takePendingRequest(requestId: string): PendingRequest | undefined {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return undefined
    clearTimeout(pending.timeout)
    this.pendingRequests.delete(requestId)
    return pending
  }

  private rejectPendingRequests(error: Error): void {
    for (const requestId of [...this.pendingRequests.keys()]) {
      this.takePendingRequest(requestId)?.reject(error)
    }
  }

  private resolveConnectionWaiter(generation: number): void {
    if (this.connectionWaiter?.generation !== generation) return
    this.connectionWaiter?.resolve()
    this.connectionWaiter = null
  }

  private rejectConnectionWaiter(error: Error, generation?: number): void {
    if (generation !== undefined && this.connectionWaiter?.generation !== generation) {
      return
    }
    this.connectionWaiter?.reject(error)
    this.connectionWaiter = null
  }

  private setState(state: RealtimeConnectionState): void {
    if (state === this.currentState) return
    this.currentState = state
    for (const handler of this.stateHandlers) {
      try {
        void Promise.resolve(handler(state)).catch((error: unknown) => {
          console.error('[realtime] state listener failed', error)
        })
      } catch (error) {
        console.error('[realtime] state listener failed', error)
      }
    }
  }
}
