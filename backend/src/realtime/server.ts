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
  /** Unix timestamp in milliseconds. */
  readonly expiresAt: number
}

export interface RealtimeConnectionInfo {
  readonly connectionId: string
  readonly userId: string
  /** Unix timestamp in milliseconds. */
  readonly authenticatedAt: number
  /** Unix timestamp in milliseconds. */
  readonly accessTokenExpiresAt: number
}

export interface RealtimeConnectionDisconnectedInfo extends RealtimeConnectionInfo {
  readonly code: number
  readonly reason: string
}

export type RealtimeConnectionLifecycleListener<T> = (
  connection: Readonly<T>,
) => void | Promise<void>

export interface PublishOptions {
  excludeConnectionId?: string
}

export interface RealtimeServerOptions {
  path: string
  allowedOrigin: string
  authTimeoutMs: number
  heartbeatIntervalMs: number
  maxPayloadBytes: number
  maxMessagesPerMinute: number
  /** Defaults to maxPayloadBytes. */
  maxOutboundPayloadBytes?: number
  /** Defaults to four maximum-sized outbound payloads. */
  maxBufferedAmountBytes?: number
  /** Maximum time to wait for accepted handlers and lifecycle observers. */
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
    const now = Date.now()
    if (now - connection.messageWindowStartedAt >= 60_000) {
      connection.messageWindowStartedAt = now
      connection.messageCount = 0
    }
    connection.messageCount += 1
    return connection.messageCount <= this.options.maxMessagesPerMinute
  }

  private heartbeat(): void {
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
