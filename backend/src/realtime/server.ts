import { randomUUID } from 'crypto';
import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import {
  authenticationDataSchema,
  inboundMessageSchema,
  outboundMessage,
  REALTIME_PROTOCOL_VERSION,
  RealtimeErrorData,
} from './protocol';
import {
  RealtimeError,
  RealtimeHandler,
  RealtimeHandlerContext,
  RealtimeRouter,
} from './router';
import { ZodType } from 'zod';

const AUTHENTICATION_FAILED_CLOSE_CODE = 4401;

interface Connection {
  readonly id: string;
  readonly socket: WebSocket;
  readonly channels: Set<string>;
  userId: string | null;
  alive: boolean;
  messageWindowStartedAt: number;
  messageCount: number;
  authTimer: NodeJS.Timeout;
  processing: Promise<void>;
}

export interface PublishOptions {
  excludeConnectionId?: string;
}

export interface RealtimeServerOptions {
  path: string;
  allowedOrigin: string;
  authTimeoutMs: number;
  heartbeatIntervalMs: number;
  maxPayloadBytes: number;
  maxMessagesPerMinute: number;
  authenticateAccessToken(accessToken: string): string;
}

function sendHttpUpgradeError(socket: Duplex, statusCode: number, statusText: string): void {
  if (socket.destroyed) return;
  socket.end(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(statusText)}\r\n\r\n` +
      statusText,
  );
}

export class RealtimeServer {
  private readonly options: RealtimeServerOptions;
  private readonly router = new RealtimeRouter();
  private readonly connections = new Map<string, Connection>();
  private readonly channels = new Map<string, Set<string>>();
  private readonly userConnections = new Map<string, Set<string>>();
  private readonly webSocketServer: WebSocketServer;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private attachedServer: HttpServer | null = null;

  constructor(options: RealtimeServerOptions) {
    this.options = options;
    this.webSocketServer = new WebSocketServer({
      noServer: true,
      maxPayload: options.maxPayloadBytes,
    });
  }

  register<T>(event: string, schema: ZodType<T>, handler: RealtimeHandler<T>): () => void {
    return this.router.register(event, schema, handler);
  }

  attach(server: HttpServer): void {
    if (this.attachedServer) throw new Error('Realtime server is already attached');
    this.attachedServer = server;
    server.on('upgrade', this.handleUpgrade);
    this.webSocketServer.on('connection', this.handleConnection);
    this.heartbeatTimer = setInterval(
      () => this.heartbeat(),
      this.options.heartbeatIntervalMs,
    );
    this.heartbeatTimer.unref();
  }

  publish(channel: string, event: string, data?: unknown, options: PublishOptions = {}): void {
    const members = this.channels.get(channel);
    if (!members) return;

    for (const connectionId of members) {
      if (connectionId === options.excludeConnectionId) continue;
      const connection = this.connections.get(connectionId);
      if (connection) this.send(connection, event, data);
    }
  }

  sendToUser(userId: string, event: string, data?: unknown): void {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return;

    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection) this.send(connection, event, data);
    }
  }

  disconnectUser(userId: string, reason = 'Session ended'): void {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return;

    for (const connectionId of [...connectionIds]) {
      this.connections.get(connectionId)?.socket.close(AUTHENTICATION_FAILED_CLOSE_CODE, reason);
    }
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.attachedServer) {
      this.attachedServer.off('upgrade', this.handleUpgrade);
      this.attachedServer = null;
    }

    for (const connection of this.connections.values()) {
      connection.socket.close(1001, 'Server shutting down');
    }

    await new Promise<void>((resolve) => {
      if (this.webSocketServer.clients.size === 0) {
        this.webSocketServer.close(() => resolve());
        return;
      }

      const forceClose = setTimeout(() => {
        for (const client of this.webSocketServer.clients) client.terminate();
      }, 1_000);
      forceClose.unref();
      this.webSocketServer.close(() => {
        clearTimeout(forceClose);
        resolve();
      });
    });
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  private readonly handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    let pathname: string;
    try {
      pathname = new URL(request.url || '/', this.options.allowedOrigin).pathname;
    } catch {
      sendHttpUpgradeError(socket, 400, 'Bad Request');
      return;
    }

    if (pathname !== this.options.path) {
      sendHttpUpgradeError(socket, 404, 'Not Found');
      return;
    }

    const origin = request.headers.origin;
    if (origin && origin !== this.options.allowedOrigin) {
      sendHttpUpgradeError(socket, 403, 'Forbidden');
      return;
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      this.webSocketServer.emit('connection', webSocket, request);
    });
  };

  private readonly handleConnection = (socket: WebSocket): void => {
    const connection: Connection = {
      id: randomUUID(),
      socket,
      channels: new Set(),
      userId: null,
      alive: true,
      messageWindowStartedAt: Date.now(),
      messageCount: 0,
      processing: Promise.resolve(),
      authTimer: setTimeout(() => {
        this.sendError(connection, 'AUTH_TIMEOUT', 'Authentication timed out', false);
        socket.close(AUTHENTICATION_FAILED_CLOSE_CODE, 'Authentication required');
      }, this.options.authTimeoutMs),
    };
    connection.authTimer.unref();
    this.connections.set(connection.id, connection);

    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (raw, isBinary) => {
      connection.processing = connection.processing
        .then(() => this.handleMessage(connection, raw, isBinary))
        .catch((error) => {
          console.error(
            `[realtime] connection ${connection.id} message failed`,
            error instanceof Error ? error.message : error,
          );
          connection.socket.close(1011, 'Message processing failed');
        });
    });
    socket.on('close', () => {
      this.removeConnection(connection);
    });
    socket.on('error', (error) => {
      console.warn(`[realtime] connection ${connection.id} error: ${error.message}`);
    });
  };

  private async handleMessage(
    connection: Connection,
    raw: RawData,
    isBinary: boolean,
  ): Promise<void> {
    if (isBinary) {
      connection.socket.close(1003, 'Binary messages are not supported');
      return;
    }
    if (!this.consumeMessageAllowance(connection)) {
      this.sendError(connection, 'RATE_LIMITED', 'Too many realtime messages', true);
      connection.socket.close(1008, 'Message rate limit exceeded');
      return;
    }

    let decoded: unknown;
    try {
      const text = Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString('utf8')
          : Buffer.from(raw).toString('utf8');
      decoded = JSON.parse(text);
    } catch {
      this.sendError(connection, 'INVALID_MESSAGE', 'Messages must be valid JSON', false);
      return;
    }

    const parsed = inboundMessageSchema.safeParse(decoded);
    if (!parsed.success) {
      this.sendError(connection, 'INVALID_MESSAGE', 'The realtime message is invalid', false);
      return;
    }

    const message = parsed.data;
    if (!connection.userId) {
      if (message.event !== 'auth.authenticate') {
        this.sendError(
          connection,
          'AUTH_REQUIRED',
          'Authenticate before sending other events',
          false,
          message.requestId,
        );
        connection.socket.close(AUTHENTICATION_FAILED_CLOSE_CODE, 'Authentication required');
        return;
      }
      this.authenticate(connection, message.data, message.requestId, false);
      return;
    }

    if (message.event === 'auth.refresh') {
      this.authenticate(connection, message.data, message.requestId, true);
      return;
    }

    try {
      const result = await this.router.dispatch(
        message.event,
        message.data,
        this.contextFor(connection),
      );
      if (message.requestId) {
        this.send(
          connection,
          'system.ack',
          { event: message.event, result },
          message.requestId,
        );
      }
    } catch (error) {
      const realtimeError =
        error instanceof RealtimeError
          ? error
          : new RealtimeError('HANDLER_FAILED', 'The realtime event could not be handled', true);
      if (!(error instanceof RealtimeError)) {
        console.error(
          `[realtime] handler "${message.event}" failed`,
          error instanceof Error ? error.message : error,
        );
      }
      this.sendError(
        connection,
        realtimeError.code,
        realtimeError.message,
        realtimeError.retryable,
        message.requestId,
      );
    }
  }

  private authenticate(
    connection: Connection,
    rawData: unknown,
    requestId: string | undefined,
    refresh: boolean,
  ): void {
    const parsed = authenticationDataSchema.safeParse(rawData);
    if (!parsed.success) {
      this.failAuthentication(connection, requestId);
      return;
    }

    try {
      const userId = this.options.authenticateAccessToken(parsed.data.accessToken);
      if (refresh && connection.userId !== userId) {
        this.failAuthentication(connection, requestId);
        return;
      }

      if (!refresh) {
        connection.userId = userId;
        clearTimeout(connection.authTimer);
        const userConnectionIds = this.userConnections.get(userId) ?? new Set<string>();
        userConnectionIds.add(connection.id);
        this.userConnections.set(userId, userConnectionIds);
        this.send(connection, 'system.ready', {
          connectionId: connection.id,
          userId,
          protocolVersion: REALTIME_PROTOCOL_VERSION,
          serverTime: new Date().toISOString(),
        });
      } else if (requestId) {
        this.send(
          connection,
          'system.ack',
          { event: 'auth.refresh' },
          requestId,
        );
      }
    } catch {
      this.failAuthentication(connection, requestId);
    }
  }

  private failAuthentication(connection: Connection, requestId?: string): void {
    this.sendError(
      connection,
      'INVALID_ACCESS_TOKEN',
      'The access token is invalid or expired',
      false,
      requestId,
    );
    connection.socket.close(AUTHENTICATION_FAILED_CLOSE_CODE, 'Invalid access token');
  }

  private contextFor(connection: Connection): RealtimeHandlerContext {
    const userId = connection.userId;
    if (!userId) throw new Error('Cannot create an unauthenticated realtime context');

    return {
      connectionId: connection.id,
      userId,
      send: (event, data) => this.send(connection, event, data),
      join: (channel) => this.join(connection, channel),
      leave: (channel) => this.leave(connection, channel),
      publish: (channel, event, data) => this.publish(channel, event, data),
    };
  }

  private join(connection: Connection, channel: string): void {
    if (!channel || channel.length > 200) {
      throw new RealtimeError('INVALID_CHANNEL', 'The channel name is invalid');
    }
    connection.channels.add(channel);
    const members = this.channels.get(channel) ?? new Set<string>();
    members.add(connection.id);
    this.channels.set(channel, members);
  }

  private leave(connection: Connection, channel: string): void {
    connection.channels.delete(channel);
    const members = this.channels.get(channel);
    if (!members) return;
    members.delete(connection.id);
    if (members.size === 0) this.channels.delete(channel);
  }

  private send(
    connection: Connection,
    event: string,
    data?: unknown,
    requestId?: string,
  ): void {
    if (connection.socket.readyState !== WebSocket.OPEN) return;
    try {
      connection.socket.send(
        JSON.stringify(outboundMessage(event, data, requestId)),
        (error) => {
          if (error) {
            console.warn(
              `[realtime] failed to send "${event}" to ${connection.id}: ${error.message}`,
            );
          }
        },
      );
    } catch (error) {
      console.warn(
        `[realtime] failed to serialize "${event}" for ${connection.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private sendError(
    connection: Connection,
    code: string,
    message: string,
    retryable: boolean,
    requestId?: string,
  ): void {
    const data: RealtimeErrorData = { code, message, retryable };
    this.send(connection, 'system.error', data, requestId);
  }

  private consumeMessageAllowance(connection: Connection): boolean {
    const now = Date.now();
    if (now - connection.messageWindowStartedAt >= 60_000) {
      connection.messageWindowStartedAt = now;
      connection.messageCount = 0;
    }
    connection.messageCount += 1;
    return connection.messageCount <= this.options.maxMessagesPerMinute;
  }

  private heartbeat(): void {
    for (const connection of this.connections.values()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }

  private removeConnection(connection: Connection): void {
    clearTimeout(connection.authTimer);
    this.connections.delete(connection.id);
    for (const channel of [...connection.channels]) this.leave(connection, channel);

    if (connection.userId) {
      const userConnectionIds = this.userConnections.get(connection.userId);
      userConnectionIds?.delete(connection.id);
      if (userConnectionIds?.size === 0) this.userConnections.delete(connection.userId);
    }
  }
}
