import { randomUUID } from 'crypto'
import { IncomingMessage, Server as HttpServer } from 'http'
import { Duplex } from 'stream'
import { RawData, WebSocket, WebSocketServer } from 'ws'
import {
  authenticationDataSchema,
  eventNameSchema,
  inboundMessageSchema,
  isRealtimeControlEvent,
  outboundMessage,
  REALTIME_CLOSE_CODE,
  REALTIME_PROTOCOL_VERSION,
  RealtimeAuthRefreshResult,
  RealtimeErrorData,
  RealtimeReadyData,
} from './protocol'
import { RealtimeError, RealtimeHandler, RealtimeHandlerContext, RealtimeRouter } from './router'
import { ZodType } from 'zod'

const SLOW_CLIENT_CLOSE_CODE = 1013
const MAX_TIMER_DELAY_MS = 2_147_483_647
const DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000

type SendResult = 'sent' | 'inactive' | 'not_serializable' | 'too_large' | 'backpressure'

interface Connection {
  readonly id: string
  readonly socket: WebSocket
  readonly channels: Set<string>
  userId: string | null
  authenticatedAt: number | null
  accessTokenExpiresAt: number | null
  authenticationExpiryPending: boolean
  activeHandlerCount: number
  active: boolean
  alive: boolean
  messageWindowStartedAt: number
  messageCount: number
  authTimer: NodeJS.Timeout | null
  accessTokenExpiryTimer: NodeJS.Timeout | null
  processing: Promise<void>
  lifecycleTask: Promise<void>
}

export interface RealtimePrincipal {
  readonly userId: string
  /** 밀리초 단위 Unix 시각 */
  readonly expiresAt: number
}

export interface RealtimeConnectionInfo {
  readonly connectionId: string
  readonly userId: string
  /** 밀리초 단위 Unix 시각 */
  readonly authenticatedAt: number
  /** 밀리초 단위 Unix 시각 */
  readonly accessTokenExpiresAt: number
}

export interface RealtimeConnectionDisconnectedInfo extends RealtimeConnectionInfo {
  readonly code: number
  readonly reason: string
}

export type RealtimeConnectionLifecycleListener<T> = (
  connection: Readonly<T>,
) => void | Promise<void>

interface PublishOptions {
  excludeConnectionId?: string
}

export interface RealtimeServerOptions {
  path: string
  allowedOrigin: string
  authTimeoutMs: number
  heartbeatIntervalMs: number
  maxPayloadBytes: number
  maxMessagesPerMinute: number
  /** 생략하면 maxPayloadBytes를 사용한다. */
  maxOutboundPayloadBytes?: number
  /** 생략하면 최대 송신 payload 네 개 분량을 사용한다. */
  maxBufferedAmountBytes?: number
  /** 이미 수락한 핸들러와 생명주기 관찰자를 기다릴 최대 시간 */
  shutdownDrainTimeoutMs?: number
  authenticateAccessToken(accessToken: string): RealtimePrincipal
}

function sendHttpUpgradeError(socket: Duplex, statusCode: number, statusText: string): void {
  if (socket.destroyed) return
  socket.end(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(statusText)}\r\n\r\n` +
      statusText,
  )
}

function closeReason(reason: string): string {
  return Buffer.byteLength(reason) <= 123 ? reason : 'Connection closed'
}

export class RealtimeServer {
  // 연결, 사용자, 채널을 서로 다른 인덱스로 관리해 채널 broadcast와 사용자별 DM을
  // 같은 서버에서 지원한다. 모든 인덱스는 removeConnection에서 함께 정리한다.
  private readonly options: RealtimeServerOptions
  private readonly router = new RealtimeRouter()
  private readonly connections = new Map<string, Connection>()
  private readonly channels = new Map<string, Set<string>>()
  private readonly userConnections = new Map<string, Set<string>>()
  private readonly webSocketServer: WebSocketServer
  private readonly maxOutboundPayloadBytes: number
  private readonly maxBufferedAmountBytes: number
  private readonly shutdownDrainTimeoutMs: number
  private readonly authenticatedListeners = new Set<
    RealtimeConnectionLifecycleListener<RealtimeConnectionInfo>
  >()
  private readonly disconnectedListeners = new Set<
    RealtimeConnectionLifecycleListener<RealtimeConnectionDisconnectedInfo>
  >()
  private readonly trackedTasks = new Set<Promise<void>>()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private attachedServer: HttpServer | null = null
  private closing = false
  private closePromise: Promise<void> | null = null

  constructor(options: RealtimeServerOptions) {
    this.options = options
    this.maxOutboundPayloadBytes = options.maxOutboundPayloadBytes ?? options.maxPayloadBytes
    this.maxBufferedAmountBytes = options.maxBufferedAmountBytes ?? this.maxOutboundPayloadBytes * 4
    this.shutdownDrainTimeoutMs =
      options.shutdownDrainTimeoutMs ?? DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS
    if (!Number.isSafeInteger(this.maxOutboundPayloadBytes) || this.maxOutboundPayloadBytes <= 0) {
      throw new Error('maxOutboundPayloadBytes must be a positive integer')
    }
    if (
      !Number.isSafeInteger(this.maxBufferedAmountBytes) ||
      this.maxBufferedAmountBytes < this.maxOutboundPayloadBytes
    ) {
      throw new Error(
        'maxBufferedAmountBytes must be an integer at least as large as maxOutboundPayloadBytes',
      )
    }
    if (!Number.isSafeInteger(this.shutdownDrainTimeoutMs) || this.shutdownDrainTimeoutMs <= 0) {
      throw new Error('shutdownDrainTimeoutMs must be a positive integer')
    }
    this.webSocketServer = new WebSocketServer({
      noServer: true,
      maxPayload: options.maxPayloadBytes,
    })
  }

  register<T>(event: string, schema: ZodType<T>, handler: RealtimeHandler<T>): () => void {
    return this.router.register(event, schema, handler)
  }

  onConnectionAuthenticated(
    listener: RealtimeConnectionLifecycleListener<RealtimeConnectionInfo>,
  ): () => void {
    const registration: RealtimeConnectionLifecycleListener<RealtimeConnectionInfo> = (
      connection,
    ) => listener(connection)
    this.authenticatedListeners.add(registration)
    return () => this.authenticatedListeners.delete(registration)
  }

  onConnectionDisconnected(
    listener: RealtimeConnectionLifecycleListener<RealtimeConnectionDisconnectedInfo>,
  ): () => void {
    const registration: RealtimeConnectionLifecycleListener<RealtimeConnectionDisconnectedInfo> = (
      connection,
    ) => listener(connection)
    this.disconnectedListeners.add(registration)
    return () => this.disconnectedListeners.delete(registration)
  }

  attach(server: HttpServer): void {
    // Express와 같은 HTTP 서버의 upgrade 이벤트만 가로채 한 포트에서 HTTP와 WS를 제공한다.
    if (this.attachedServer) throw new Error('Realtime server is already attached')
    this.attachedServer = server
    server.on('upgrade', this.handleUpgrade)
    this.webSocketServer.on('connection', this.handleConnection)
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.options.heartbeatIntervalMs)
    this.heartbeatTimer.unref()
  }

  publish(channel: string, event: string, data?: unknown, options: PublishOptions = {}): void {
    this.assertApplicationEventName(event)
    const members = this.channels.get(channel)
    if (!members) return

    for (const connectionId of members) {
      if (connectionId === options.excludeConnectionId) continue
      const connection = this.connections.get(connectionId)
      if (connection) this.sendApplicationEvent(connection, event, data)
    }
  }

  sendToUser(userId: string, event: string, data?: unknown): void {
    this.assertApplicationEventName(event)
    const connectionIds = this.userConnections.get(userId)
    if (!connectionIds) return

    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId)
      if (connection) this.sendApplicationEvent(connection, event, data)
    }
  }

  sendToUsers(userIds: Iterable<string>, event: string, data?: unknown): void {
    for (const userId of new Set(userIds)) {
      this.sendToUser(userId, event, data)
    }
  }

  leaveUserChannel(userId: string, channel: string): void {
    const connectionIds = this.userConnections.get(userId)
    if (!connectionIds) return

    for (const connectionId of [...connectionIds]) {
      const connection = this.connections.get(connectionId)
      if (connection) this.leave(connection, channel)
    }
  }

  clearChannel(channel: string): void {
    const connectionIds = this.channels.get(channel)
    if (!connectionIds) return

    for (const connectionId of [...connectionIds]) {
      const connection = this.connections.get(connectionId)
      if (connection) this.leave(connection, channel)
    }
  }

  disconnectUser(userId: string, reason = 'Session ended'): void {
    const connectionIds = this.userConnections.get(userId)
    if (!connectionIds) return

    for (const connectionId of [...connectionIds]) {
      const connection = this.connections.get(connectionId)
      if (connection) {
        this.closeConnection(connection, REALTIME_CLOSE_CODE.SESSION_TERMINATED, reason)
      }
    }
  }

  async close(): Promise<void> {
    if (!this.closePromise) {
      this.closePromise = this.performClose()
    }
    return this.closePromise
  }

  private async performClose(): Promise<void> {
    // 종료가 시작되면 새 upgrade와 메시지를 막고, 이미 수락한 핸들러가 끝난 뒤 연결을 닫는다.
    // 제한 시간 이후에는 강제 종료해 프로세스가 무기한 멈추지 않게 한다.
    this.closing = true
    const drainDeadline = Date.now() + this.shutdownDrainTimeoutMs
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.attachedServer) {
      this.attachedServer.off('upgrade', this.handleUpgrade)
      this.attachedServer = null
    }

    for (const connection of [...this.connections.values()]) {
      if (connection.activeHandlerCount === 0) {
        this.closeConnection(connection, 1001, 'Server shutting down')
      }
    }

    const acceptedTasksDrained = await this.drainTrackedTasks(drainDeadline)
    for (const connection of [...this.connections.values()]) {
      this.closeConnection(connection, 1001, 'Server shutting down')
    }
    const lifecycleTasksDrained = await this.drainTrackedTasks(drainDeadline)
    if (!acceptedTasksDrained || !lifecycleTasksDrained) {
      console.warn(`[realtime] shutdown drain exceeded ${this.shutdownDrainTimeoutMs}ms`)
    }

    await new Promise<void>((resolve) => {
      if (this.webSocketServer.clients.size === 0) {
        this.webSocketServer.close(() => resolve())
        return
      }

      const forceClose = setTimeout(() => {
        for (const client of this.webSocketServer.clients) client.terminate()
      }, 1_000)
      forceClose.unref()
      this.webSocketServer.close(() => {
        clearTimeout(forceClose)
        resolve()
      })
    })
  }

  get connectionCount(): number {
    return this.connections.size
  }

  private readonly handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    if (this.closing) {
      sendHttpUpgradeError(socket, 503, 'Service Unavailable')
      return
    }
    let pathname: string
    try {
      pathname = new URL(request.url || '/', this.options.allowedOrigin).pathname
    } catch {
      sendHttpUpgradeError(socket, 400, 'Bad Request')
      return
    }

    // 지정 경로와 정확한 Origin만 upgrade해 일반 HTTP 요청이나 타 사이트의
    // 브라우저가 인증된 WebSocket을 임의로 열지 못하게 한다.
    if (pathname !== this.options.path) {
      sendHttpUpgradeError(socket, 404, 'Not Found')
      return
    }

    const origin = request.headers.origin
    if (origin !== this.options.allowedOrigin) {
      sendHttpUpgradeError(socket, 403, 'Forbidden')
      return
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      this.webSocketServer.emit('connection', webSocket, request)
    })
  }

  private readonly handleConnection = (socket: WebSocket): void => {
    if (this.closing) {
      socket.close(1012, 'Server restarting')
      return
    }
    const connection: Connection = {
      id: randomUUID(),
      socket,
      channels: new Set(),
      userId: null,
      authenticatedAt: null,
      accessTokenExpiresAt: null,
      authenticationExpiryPending: false,
      activeHandlerCount: 0,
      active: true,
      alive: true,
      messageWindowStartedAt: Date.now(),
      messageCount: 0,
      processing: Promise.resolve(),
      lifecycleTask: Promise.resolve(),
      authTimer: null,
      accessTokenExpiryTimer: null,
    }
    // 미인증 소켓이 리소스를 무기한 점유하지 않도록 제한 시간 안에 인증을 요구한다.
    connection.authTimer = setTimeout(() => {
      if (!this.isActive(connection)) return
      this.sendError(connection, 'AUTH_TIMEOUT', 'Authentication timed out', false)
      this.closeConnection(
        connection,
        REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED,
        'Authentication required',
      )
    }, this.options.authTimeoutMs)
    connection.authTimer.unref()
    this.connections.set(connection.id, connection)

    socket.on('pong', () => {
      if (this.isActive(connection)) {
        connection.alive = true
      }
    })
    socket.on('message', (raw, isBinary) => {
      if (!this.isActive(connection) || this.closing) return
      if (isBinary) {
        this.closeConnection(connection, 1003, 'Binary messages are not supported')
        return
      }
      if (!this.consumeMessageAllowance(connection)) {
        this.sendError(connection, 'RATE_LIMITED', 'Too many realtime messages', true)
        this.closeConnection(
          connection,
          REALTIME_CLOSE_CODE.RATE_LIMITED,
          'Message rate limit exceeded',
        )
        return
      }

      // 같은 연결의 메시지는 Promise 체인으로 직렬화해 앞선 이동/수정이 끝나기 전에
      // 다음 이벤트가 추월하지 않게 한다. 연결끼리는 독립적으로 병렬 처리된다.
      connection.processing = connection.processing
        .then(() => this.handleMessage(connection, raw))
        .catch((error) => {
          if (!this.isActive(connection)) return
          console.error(
            `[realtime] connection ${connection.id} message failed`,
            error instanceof Error ? error.message : error,
          )
          this.closeConnection(connection, 1011, 'Message processing failed')
        })
      this.trackTask(connection.processing)
    })
    socket.on('close', (code, reason) => {
      this.removeConnection(connection, code, reason.toString())
    })
    socket.on('error', (error) => {
      console.warn(`[realtime] connection ${connection.id} error: ${error.message}`)
    })
  }

  private async handleMessage(connection: Connection, raw: RawData): Promise<void> {
    if (!this.isActive(connection) || this.closing) return
    if (this.authenticationExpired(connection)) {
      this.expireAuthentication(connection)
      return
    }
    let decoded: unknown
    try {
      const text = Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString('utf8')
          : Buffer.from(raw).toString('utf8')
      decoded = JSON.parse(text)
    } catch {
      this.sendError(connection, 'INVALID_MESSAGE', 'Messages must be valid JSON', false)
      return
    }

    const parsed = inboundMessageSchema.safeParse(decoded)
    if (!parsed.success) {
      this.sendError(connection, 'INVALID_MESSAGE', 'The realtime message is invalid', false)
      return
    }

    const message = parsed.data
    // 인증 전에 허용되는 유일한 유효 프로토콜 이벤트는 auth.authenticate다.
    // 인증 뒤에는 auth.refresh만 제어 이벤트로 처리하고 나머지는 도메인 라우터로 전달한다.
    if (!connection.userId) {
      if (message.event !== 'auth.authenticate') {
        this.sendError(
          connection,
          'AUTH_REQUIRED',
          'Authenticate before sending other events',
          false,
          message.requestId,
        )
        this.closeConnection(
          connection,
          REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED,
          'Authentication required',
        )
        return
      }
      this.authenticate(connection, message.data, message.requestId, false)
      return
    }

    if (message.event === 'auth.refresh') {
      this.authenticate(connection, message.data, message.requestId, true)
      return
    }

    // 처리 중 토큰이 만료돼도 이미 허용한 핸들러는 끝까지 실행하고, finally에서 연결을 닫는다.
    connection.activeHandlerCount += 1
    try {
      try {
        const result = await this.router.dispatch(
          message.event,
          message.data,
          this.contextFor(connection),
        )
        if (!this.isActive(connection)) return
        if (message.requestId) {
          this.sendRequestAcknowledgement(connection, message.event, result, message.requestId)
        }
      } catch (error) {
        if (!this.isActive(connection)) return
        const realtimeError =
          error instanceof RealtimeError
            ? error
            : new RealtimeError('HANDLER_FAILED', 'The realtime event could not be handled', true)
        if (!(error instanceof RealtimeError)) {
          console.error(
            `[realtime] handler "${message.event}" failed`,
            error instanceof Error ? error.message : error,
          )
        }
        this.sendHandlerError(
          connection,
          realtimeError.code,
          realtimeError.message,
          realtimeError.retryable,
          message.requestId,
        )
      }
    } finally {
      connection.activeHandlerCount -= 1
      if (
        this.isActive(connection) &&
        !this.closing &&
        (connection.authenticationExpiryPending || this.authenticationExpired(connection))
      ) {
        this.expireAuthentication(connection)
      }
    }
  }

  private authenticate(
    connection: Connection,
    rawData: unknown,
    requestId: string | undefined,
    refresh: boolean,
  ): void {
    if (!this.isActive(connection)) return
    const parsed = authenticationDataSchema.safeParse(rawData)
    if (!parsed.success) {
      this.failAuthentication(connection, requestId)
      return
    }

    try {
      const principal = this.options.authenticateAccessToken(parsed.data.accessToken)
      this.assertValidPrincipal(principal)
      // 연결 중 토큰 갱신은 같은 사용자만 허용해 인증된 소켓의 주체가 바뀌지 않게 한다.
      if (refresh && connection.userId !== principal.userId) {
        this.failAuthentication(connection, requestId)
        return
      }

      if (!refresh) {
        const authenticatedAt = Date.now()
        connection.userId = principal.userId
        connection.authenticatedAt = authenticatedAt
        connection.accessTokenExpiresAt = principal.expiresAt
        connection.authenticationExpiryPending = false
        this.clearAuthTimer(connection)
        // 한 사용자의 여러 탭/기기 연결을 모두 찾아 DM과 알림을 동시에 보낼 수 있게 색인한다.
        const userConnectionIds = this.userConnections.get(principal.userId) ?? new Set<string>()
        userConnectionIds.add(connection.id)
        this.userConnections.set(principal.userId, userConnectionIds)
        this.scheduleAuthenticationExpiry(connection)
        if (!this.isActive(connection)) return
        const connectionInfo = this.connectionInfo(connection)
        this.enqueueLifecycle(
          connection,
          this.authenticatedListeners,
          connectionInfo,
          'authenticated',
        )
        const readyData: RealtimeReadyData = {
          connectionId: connection.id,
          userId: principal.userId,
          protocolVersion: REALTIME_PROTOCOL_VERSION,
          serverTime: new Date().toISOString(),
          accessTokenExpiresAt: new Date(principal.expiresAt).toISOString(),
        }
        if (this.send(connection, 'system.ready', readyData) !== 'sent') {
          this.closeConnection(connection, 1011, 'Authentication response failed')
        }
      } else {
        connection.accessTokenExpiresAt = principal.expiresAt
        connection.authenticationExpiryPending = false
        this.scheduleAuthenticationExpiry(connection)
        if (!this.isActive(connection)) return
        if (!requestId) return
        const result: RealtimeAuthRefreshResult = {
          accessTokenExpiresAt: new Date(principal.expiresAt).toISOString(),
        }
        this.sendRequestAcknowledgement(connection, 'auth.refresh', result, requestId)
      }
    } catch {
      this.failAuthentication(connection, requestId)
    }
  }

  private failAuthentication(connection: Connection, requestId?: string): void {
    if (!this.isActive(connection)) return
    this.sendError(
      connection,
      'INVALID_ACCESS_TOKEN',
      'The access token is invalid or expired',
      false,
      requestId,
    )
    this.closeConnection(
      connection,
      REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED,
      'Invalid access token',
    )
  }

  private contextFor(connection: Connection): RealtimeHandlerContext {
    const userId = connection.userId
    if (!userId || !this.isActive(connection)) {
      throw new Error('Cannot create an unauthenticated realtime context')
    }

    return {
      connectionId: connection.id,
      userId,
      send: (event, data) => {
        this.assertApplicationEventName(event)
        this.sendApplicationEvent(connection, event, data)
      },
      join: (channel) => this.join(connection, channel),
      leave: (channel) => this.leave(connection, channel),
      publish: (channel, event, data) => this.publish(channel, event, data),
    }
  }

  private join(connection: Connection, channel: string): void {
    // 채널 이름은 서버 도메인 핸들러가 결정하고, 여기서는 활성 인증과 크기만 최종 방어한다.
    this.assertCanJoin(connection)
    if (!channel || channel.length > 200) {
      throw new RealtimeError('INVALID_CHANNEL', 'The channel name is invalid')
    }
    connection.channels.add(channel)
    const members = this.channels.get(channel) ?? new Set<string>()
    members.add(connection.id)
    this.channels.set(channel, members)
  }

  private leave(connection: Connection, channel: string): void {
    connection.channels.delete(channel)
    const members = this.channels.get(channel)
    if (!members) return
    members.delete(connection.id)
    if (members.size === 0) this.channels.delete(channel)
  }

  private sendApplicationEvent(connection: Connection, event: string, data?: unknown): void {
    const result = this.send(connection, event, data)
    // 일부 이벤트가 누락되면 클라이언트 상태가 서버와 달라질 수 있으므로
    // 직렬화 불가/크기 초과 시 연결을 닫아 전체 재동기화를 유도한다.
    if (result === 'not_serializable' || result === 'too_large') {
      this.closeConnection(
        connection,
        REALTIME_CLOSE_CODE.RESYNC_REQUIRED,
        'Realtime state requires resynchronization',
      )
    }
  }

  private assertApplicationEventName(event: string): void {
    if (!eventNameSchema.safeParse(event).success) {
      throw new Error(`Invalid outbound realtime event name "${event}"`)
    }
    // system/auth 네임스페이스의 제어 이벤트는 서버 프로토콜만 만들 수 있다.
    if (isRealtimeControlEvent(event)) {
      throw new Error(`Realtime control event "${event}" is reserved by the protocol`)
    }
  }

  private sendRequestAcknowledgement(
    connection: Connection,
    event: string,
    result: unknown,
    requestId: string,
  ): void {
    const sendResult = this.send(connection, 'system.ack', { event, result }, requestId)
    if (sendResult === 'not_serializable') {
      this.sendResponseFailure(
        connection,
        'RESPONSE_NOT_SERIALIZABLE',
        'The realtime response could not be serialized',
        requestId,
      )
    } else if (sendResult === 'too_large') {
      this.sendResponseFailure(
        connection,
        'RESPONSE_TOO_LARGE',
        'The realtime response exceeds the payload limit',
        requestId,
      )
    }
  }

  private sendResponseFailure(
    connection: Connection,
    code: string,
    message: string,
    requestId: string,
  ): void {
    const result = this.sendError(connection, code, message, false, requestId)
    if (result === 'not_serializable' || result === 'too_large') {
      this.closeConnection(
        connection,
        REALTIME_CLOSE_CODE.RESYNC_REQUIRED,
        'Realtime state requires resynchronization',
      )
    }
  }

  private sendHandlerError(
    connection: Connection,
    code: string,
    message: string,
    retryable: boolean,
    requestId?: string,
  ): void {
    const result = this.sendError(connection, code, message, retryable, requestId)
    if (result !== 'not_serializable' && result !== 'too_large') return

    if (requestId) {
      const fallbackResult = this.sendError(
        connection,
        'HANDLER_ERROR_RESPONSE_INVALID',
        'The realtime handler error could not be represented',
        false,
        requestId,
      )
      if (fallbackResult !== 'not_serializable' && fallbackResult !== 'too_large') {
        return
      }
    }

    this.closeConnection(
      connection,
      REALTIME_CLOSE_CODE.RESYNC_REQUIRED,
      'Realtime state requires resynchronization',
    )
  }

  private send(
    connection: Connection,
    event: string,
    data?: unknown,
    requestId?: string,
  ): SendResult {
    if (!this.isActive(connection) || connection.socket.readyState !== WebSocket.OPEN) {
      return 'inactive'
    }
    let serialized: string
    try {
      serialized = JSON.stringify(outboundMessage(event, data, requestId))
    } catch (error) {
      console.warn(
        `[realtime] failed to serialize "${event}" for ${connection.id}:`,
        error instanceof Error ? error.message : error,
      )
      return 'not_serializable'
    }

    const payloadBytes = Buffer.byteLength(serialized)
    if (payloadBytes > this.maxOutboundPayloadBytes) {
      console.warn(
        `[realtime] skipped oversized "${event}" payload for ${connection.id} ` +
          `(${payloadBytes} > ${this.maxOutboundPayloadBytes} bytes)`,
      )
      return 'too_large'
    }
    // 송신 버퍼가 계속 쌓이는 느린 클라이언트를 끊어 서버 메모리 증가와
    // 이미 오래된 이벤트의 무한 적체를 막는다.
    if (connection.socket.bufferedAmount + payloadBytes > this.maxBufferedAmountBytes) {
      console.warn(`[realtime] closing slow connection ${connection.id}`)
      this.closeConnection(connection, SLOW_CLIENT_CLOSE_CODE, 'Client is too slow')
      return 'backpressure'
    }

    try {
      connection.socket.send(serialized, (error) => {
        if (error) {
          console.warn(`[realtime] failed to send "${event}" to ${connection.id}: ${error.message}`)
          if (this.isActive(connection)) {
            this.closeConnection(connection, 1011, 'Message delivery failed')
          }
        }
      })
      return 'sent'
    } catch (error) {
      console.warn(
        `[realtime] failed to send "${event}" to ${connection.id}:`,
        error instanceof Error ? error.message : error,
      )
      this.closeConnection(connection, 1011, 'Message delivery failed')
      return 'inactive'
    }
  }

  private sendError(
    connection: Connection,
    code: string,
    message: string,
    retryable: boolean,
    requestId?: string,
  ): SendResult {
    const data: RealtimeErrorData = { code, message, retryable }
    return this.send(connection, 'system.error', data, requestId)
  }

  private consumeMessageAllowance(connection: Connection): boolean {
    // 프로토타입에 맞는 연결별 고정 1분 창으로 메시지 폭주를 제한한다.
    const now = Date.now()
    if (now - connection.messageWindowStartedAt >= 60_000) {
      connection.messageWindowStartedAt = now
      connection.messageCount = 0
    }
    connection.messageCount += 1
    return connection.messageCount <= this.options.maxMessagesPerMinute
  }

  private heartbeat(): void {
    // 이전 ping에 pong을 보내지 않은 연결은 유령 연결로 보고 정리한다.
    for (const connection of [...this.connections.values()]) {
      if (this.authenticationExpired(connection)) {
        this.expireAuthentication(connection)
        continue
      }
      if (!connection.alive) {
        this.removeConnection(connection, 1006, 'Heartbeat timed out')
        connection.socket.terminate()
        continue
      }
      connection.alive = false
      try {
        connection.socket.ping()
      } catch {
        this.removeConnection(connection, 1006, 'Heartbeat failed')
        connection.socket.terminate()
      }
    }
  }

  private assertValidPrincipal(principal: RealtimePrincipal): void {
    if (
      !principal ||
      typeof principal.userId !== 'string' ||
      !principal.userId.trim() ||
      !Number.isSafeInteger(principal.expiresAt) ||
      principal.expiresAt <= Date.now()
    ) {
      throw new Error('The access token principal is invalid or expired')
    }
  }

  private authenticationExpired(connection: Connection): boolean {
    return connection.accessTokenExpiresAt !== null && connection.accessTokenExpiresAt <= Date.now()
  }

  private scheduleAuthenticationExpiry(connection: Connection): void {
    this.clearAccessTokenExpiryTimer(connection)
    const expiresAt = connection.accessTokenExpiresAt
    if (expiresAt === null || !this.isActive(connection)) return

    const remainingMs = expiresAt - Date.now()
    if (remainingMs <= 0) {
      this.expireAuthentication(connection)
      return
    }

    // setTimeout 최대 범위를 넘는 TTL은 잘라 예약하고, 깨어난 시점에 다시 계산한다.
    connection.accessTokenExpiryTimer = setTimeout(
      () => {
        connection.accessTokenExpiryTimer = null
        if (!this.isActive(connection)) return
        if (connection.accessTokenExpiresAt !== expiresAt) return
        if (!this.authenticationExpired(connection)) {
          this.scheduleAuthenticationExpiry(connection)
          return
        }
        this.expireAuthentication(connection)
      },
      Math.min(remainingMs, MAX_TIMER_DELAY_MS),
    )
    connection.accessTokenExpiryTimer.unref()
  }

  private expireAuthentication(connection: Connection): void {
    if (!this.isActive(connection)) return
    // 유효한 access token으로 시작한 도메인 작업을 중간에 끊지 않고 완료 직후 만료 처리한다.
    if (connection.activeHandlerCount > 0) {
      connection.authenticationExpiryPending = true
      return
    }
    this.sendError(connection, 'ACCESS_TOKEN_EXPIRED', 'The access token expired', true)
    this.closeConnection(
      connection,
      REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED,
      'Access token expired',
    )
  }

  private assertCanJoin(connection: Connection): void {
    if (!this.isActive(connection) || !connection.userId) {
      throw new RealtimeError('CONNECTION_CLOSED', 'The realtime connection is no longer active')
    }
    if (this.authenticationExpired(connection) && connection.activeHandlerCount === 0) {
      this.expireAuthentication(connection)
      throw new RealtimeError('ACCESS_TOKEN_EXPIRED', 'The access token expired')
    }
  }

  private isActive(connection: Connection): boolean {
    return (
      connection.active &&
      this.connections.get(connection.id) === connection &&
      connection.socket.readyState === WebSocket.OPEN
    )
  }

  private closeConnection(connection: Connection, code: number, reason: string): void {
    if (!connection.active || this.connections.get(connection.id) !== connection) return
    const normalizedReason = closeReason(reason)
    this.removeConnection(connection, code, normalizedReason)
    if (
      connection.socket.readyState === WebSocket.OPEN ||
      connection.socket.readyState === WebSocket.CONNECTING
    ) {
      try {
        connection.socket.close(code, normalizedReason)
      } catch {
        connection.socket.terminate()
      }
    }
  }

  private removeConnection(connection: Connection, code: number, reason: string): void {
    if (!connection.active || this.connections.get(connection.id) !== connection) return
    // active 플래그를 먼저 내리고 모든 색인/타이머를 한 곳에서 제거해
    // close/error/heartbeat가 동시에 와도 중복 정리와 중복 알림을 막는다.
    connection.active = false
    this.clearAuthTimer(connection)
    this.clearAccessTokenExpiryTimer(connection)
    this.connections.delete(connection.id)
    for (const channel of [...connection.channels]) this.leave(connection, channel)

    if (connection.userId) {
      const userConnectionIds = this.userConnections.get(connection.userId)
      userConnectionIds?.delete(connection.id)
      if (userConnectionIds?.size === 0) this.userConnections.delete(connection.userId)
    }

    if (
      connection.userId &&
      connection.authenticatedAt !== null &&
      connection.accessTokenExpiresAt !== null
    ) {
      this.enqueueLifecycle(
        connection,
        this.disconnectedListeners,
        Object.freeze({
          ...this.connectionInfo(connection),
          code,
          reason,
        }),
        'disconnected',
      )
    }
  }

  private clearAuthTimer(connection: Connection): void {
    if (!connection.authTimer) return
    clearTimeout(connection.authTimer)
    connection.authTimer = null
  }

  private clearAccessTokenExpiryTimer(connection: Connection): void {
    if (!connection.accessTokenExpiryTimer) return
    clearTimeout(connection.accessTokenExpiryTimer)
    connection.accessTokenExpiryTimer = null
  }

  private connectionInfo(connection: Connection): Readonly<RealtimeConnectionInfo> {
    if (
      !connection.userId ||
      connection.authenticatedAt === null ||
      connection.accessTokenExpiresAt === null
    ) {
      throw new Error('Cannot describe an unauthenticated realtime connection')
    }
    return Object.freeze({
      connectionId: connection.id,
      userId: connection.userId,
      authenticatedAt: connection.authenticatedAt,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
    })
  }

  private enqueueLifecycle<T>(
    connection: Connection,
    listeners: ReadonlySet<RealtimeConnectionLifecycleListener<T>>,
    value: Readonly<T>,
    lifecycle: string,
  ): void {
    // 같은 연결의 lifecycle 이벤트 그룹은 발생 순서대로 처리하고, 한 이벤트의 관찰자는
    // 서로 막지 않도록 병렬 실행한다. 실패는 소켓 핵심 흐름과 분리하되 종료 시에는 기다린다.
    const listenerSnapshot = [...listeners]
    connection.lifecycleTask = connection.lifecycleTask.then(() =>
      this.runLifecycleListeners(listenerSnapshot, value, lifecycle),
    )
    this.trackTask(connection.lifecycleTask)
  }

  private async runLifecycleListeners<T>(
    listeners: readonly RealtimeConnectionLifecycleListener<T>[],
    value: Readonly<T>,
    lifecycle: string,
  ): Promise<void> {
    await Promise.all(
      listeners.map(async (listener) => {
        try {
          await listener(value)
        } catch (error) {
          console.error(
            `[realtime] ${lifecycle} lifecycle listener failed`,
            error instanceof Error ? error.message : error,
          )
        }
      }),
    )
  }

  private trackTask(task: Promise<void>): void {
    this.trackedTasks.add(task)
    void task.then(
      () => this.trackedTasks.delete(task),
      () => this.trackedTasks.delete(task),
    )
  }

  private async drainTrackedTasks(deadline: number): Promise<boolean> {
    while (this.trackedTasks.size > 0) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) return false
      if (!(await this.settleTrackedTaskSnapshot([...this.trackedTasks], remainingMs))) {
        return false
      }
    }
    return true
  }

  private settleTrackedTaskSnapshot(
    tasks: readonly Promise<void>[],
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false
      const timeout = setTimeout(() => {
        settled = true
        resolve(false)
      }, timeoutMs)

      void Promise.allSettled(tasks).then(() => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(true)
      })
    })
  }
}
