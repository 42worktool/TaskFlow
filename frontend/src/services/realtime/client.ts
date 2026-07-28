import {
  parseRealtimeMessage,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeErrorData,
  type RealtimeMessage,
} from './protocol'

export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface RealtimeClientOptions {
  tokenProvider: (forceRefresh: boolean) => Promise<string | null>
  urlFactory?: () => string
  reconnectBaseDelayMs?: number
  reconnectMaxDelayMs?: number
  requestTimeoutMs?: number
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

interface ConnectionWaiter {
  promise: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
}

type EventHandler = (data: unknown) => void

export class RealtimeRequestError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(message)
    this.name = 'RealtimeRequestError'
    this.code = code
    this.retryable = retryable
  }
}

function defaultUrl(): string {
  const url = new URL('/ws', window.location.href)
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export class RealtimeClient<ServerEvents extends object, ClientEvents extends object> {
  private readonly options: RealtimeClientOptions
  private readonly handlers = new Map<string, Set<EventHandler>>()
  private readonly stateHandlers = new Set<(state: RealtimeConnectionState) => void>()
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private shouldReconnect = false
  private refreshAttempted = false
  private forceRefreshOnNextConnect = false
  private connectionWaiter: ConnectionWaiter | null = null
  private currentState: RealtimeConnectionState = 'idle'

  constructor(options: RealtimeClientOptions) {
    this.options = options
  }

  get state(): RealtimeConnectionState {
    return this.currentState
  }

  get isConnected(): boolean {
    return this.currentState === 'connected'
  }

  connect(): Promise<void> {
    this.shouldReconnect = true
    if (this.isConnected) return Promise.resolve()
    if (this.connectionWaiter) return this.connectionWaiter.promise

    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    this.connectionWaiter = { promise, resolve, reject }
    void this.openSocket()
    return promise
  }

  disconnect(code = 1000, reason = 'Client disconnected'): void {
    this.shouldReconnect = false
    this.clearReconnectTimer()
    this.rejectConnectionWaiter(new Error(reason))
    this.rejectPendingRequests(new Error('Realtime connection closed'))

    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(code, reason)
    this.setState('disconnected')
  }

  async refreshAuthentication(): Promise<void> {
    if (!this.isConnected) {
      await this.connect()
      return
    }

    const accessToken = await this.options.tokenProvider(false)
    if (!accessToken) {
      this.disconnect(1000, 'Authentication unavailable')
      return
    }
    await this.requestWire('auth.refresh', { accessToken })
  }

  on<Event extends Extract<keyof ServerEvents, string>>(
    event: Event,
    handler: (data: ServerEvents[Event]) => void,
  ): () => void {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler>()
    handlers.add(handler as EventHandler)
    this.handlers.set(event, handlers)
    return () => {
      handlers.delete(handler as EventHandler)
      if (handlers.size === 0) this.handlers.delete(event)
    }
  }

  onStateChange(handler: (state: RealtimeConnectionState) => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  send<Event extends Extract<keyof ClientEvents, string>>(
    event: Event,
    data: ClientEvents[Event],
  ): void {
    this.assertConnected()
    this.sendWire({ v: REALTIME_PROTOCOL_VERSION, event, data })
  }

  request<Result = unknown, Event extends Extract<keyof ClientEvents, string> = Extract<
    keyof ClientEvents,
    string
  >>(event: Event, data: ClientEvents[Event]): Promise<Result> {
    return this.requestWire(event, data) as Promise<Result>
  }

  private async openSocket(): Promise<void> {
    if (!this.shouldReconnect || this.socket) return
    this.setState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting')

    let accessToken: string | null
    try {
      accessToken = await this.options.tokenProvider(this.forceRefreshOnNextConnect)
      this.forceRefreshOnNextConnect = false
    } catch {
      accessToken = null
    }

    if (!this.shouldReconnect) return
    if (!accessToken) {
      const error = new Error('No access token is available for the realtime connection')
      this.shouldReconnect = false
      this.setState('disconnected')
      this.rejectConnectionWaiter(error)
      return
    }

    let socket: WebSocket
    try {
      socket = new WebSocket((this.options.urlFactory ?? defaultUrl)())
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.addEventListener('open', () => {
      if (socket !== this.socket) return
      this.setState('authenticating')
      this.sendWire({
        v: REALTIME_PROTOCOL_VERSION,
        event: 'auth.authenticate',
        data: { accessToken },
      })
    })

    socket.addEventListener('message', (event) => {
      if (socket !== this.socket || typeof event.data !== 'string') return
      this.handleMessage(parseRealtimeMessage(event.data))
    })

    socket.addEventListener('close', (event) => {
      if (socket !== this.socket) return
      this.socket = null
      this.rejectPendingRequests(new Error('Realtime connection interrupted'))

      if (!this.shouldReconnect) {
        this.setState('disconnected')
        return
      }

      if (event.code === 4401) {
        if (this.refreshAttempted) {
          this.shouldReconnect = false
          this.setState('disconnected')
          this.rejectConnectionWaiter(new Error('Realtime authentication failed'))
          return
        }
        this.refreshAttempted = true
        this.forceRefreshOnNextConnect = true
        this.scheduleReconnect(0)
        return
      }
      this.scheduleReconnect()
    })
  }

  private handleMessage(message: RealtimeMessage | null): void {
    if (!message) return

    if (message.event === 'system.ready') {
      this.reconnectAttempt = 0
      this.refreshAttempted = false
      this.setState('connected')
      this.resolveConnectionWaiter()
    }

    if (message.requestId && message.event === 'system.ack') {
      const pending = this.takePendingRequest(message.requestId)
      const data = message.data as { result?: unknown } | undefined
      pending?.resolve(data?.result)
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
        handler(message.data)
      } catch (error) {
        console.error(`[realtime] "${message.event}" listener failed`, error)
      }
    }
  }

  private requestWire(event: string, data: unknown): Promise<unknown> {
    this.assertConnected()
    const requestId = createRequestId()
    const timeoutMs = this.options.requestTimeoutMs ?? 10_000

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Realtime request "${event}" timed out`))
      }, timeoutMs)
      this.pendingRequests.set(requestId, { resolve, reject, timeout })
      try {
        this.sendWire({ v: REALTIME_PROTOCOL_VERSION, event, requestId, data })
      } catch (error) {
        this.takePendingRequest(requestId)
        reject(error instanceof Error ? error : new Error('Realtime request could not be sent'))
      }
    })
  }

  private sendWire(message: RealtimeMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Realtime connection is not open')
    }
    this.socket.send(JSON.stringify(message))
  }

  private assertConnected(): void {
    if (!this.isConnected) throw new Error('Realtime client is not connected')
  }

  private scheduleReconnect(delay?: number): void {
    if (!this.shouldReconnect || this.reconnectTimer) return
    this.reconnectAttempt += 1
    this.setState('reconnecting')

    const base = this.options.reconnectBaseDelayMs ?? 500
    const maximum = this.options.reconnectMaxDelayMs ?? 30_000
    const exponentialDelay = Math.min(maximum, base * 2 ** (this.reconnectAttempt - 1))
    const jitteredDelay = exponentialDelay * (0.75 + Math.random() * 0.5)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.openSocket()
    }, delay ?? jitteredDelay)
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
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

  private resolveConnectionWaiter(): void {
    this.connectionWaiter?.resolve()
    this.connectionWaiter = null
  }

  private rejectConnectionWaiter(error: Error): void {
    this.connectionWaiter?.reject(error)
    this.connectionWaiter = null
  }

  private setState(state: RealtimeConnectionState): void {
    if (state === this.currentState) return
    this.currentState = state
    for (const handler of this.stateHandlers) handler(state)
  }
}
