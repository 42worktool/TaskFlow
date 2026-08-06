import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeClient, RealtimeSendError, type RealtimeClientOptions } from './client'
import { REALTIME_CLOSE_CODE, REALTIME_PROTOCOL_VERSION, type RealtimeReadyData } from './protocol'

interface TestServerEvents {
  'system.ready': RealtimeReadyData
}

interface TestClientEvents {
  'workspace.subscribe': { workspaceId: string }
}

interface TestRequestResults {
  'workspace.subscribe': { cursor: number }
}

type Listener = (event: Record<string, unknown>) => void

class FakeWebSocket {
  readyState = 0
  bufferedAmount = 0
  readonly sent: string[] = []
  readonly closeCalls: Array<{ code?: number; reason?: string }> = []
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('Socket is not open')
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason })
    this.readyState = 3
    this.emit('close', { code: code ?? 1000, reason: reason ?? '' })
  }

  open(): void {
    this.readyState = 1
    this.emit('open', {})
  }

  receive(event: string, data: unknown, requestId?: string): void {
    this.emit('message', {
      data: JSON.stringify({
        v: REALTIME_PROTOCOL_VERSION,
        event,
        ...(requestId ? { requestId } : {}),
        data,
      }),
    })
  }

  receiveRaw(data: unknown): void {
    this.emit('message', { data })
  }

  serverClose(code = 1006): void {
    this.readyState = 3
    this.emit('close', { code, reason: 'server closed' })
  }

  failTransport(): void {
    this.emit('error', {})
  }

  private emit(type: string, event: Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function ready(
  connectionId: string,
  accessTokenExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString(),
  serverTime = new Date(Date.now()).toISOString(),
): RealtimeReadyData {
  return {
    connectionId,
    userId: 'user-1',
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    serverTime,
    accessTokenExpiresAt,
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createHarness(
  tokenProvider: (forceRefresh: boolean) => Promise<string | null> = async () => 'access-token',
  options: Omit<
    Partial<RealtimeClientOptions>,
    'tokenProvider' | 'urlFactory' | 'webSocketFactory'
  > = {},
) {
  const sockets: FakeWebSocket[] = []
  const client = new RealtimeClient<TestServerEvents, TestClientEvents, TestRequestResults>({
    ...options,
    tokenProvider,
    urlFactory: () => 'ws://realtime.test/ws',
    webSocketFactory: () => {
      const socket = new FakeWebSocket()
      sockets.push(socket)
      return socket as unknown as WebSocket
    },
    reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 10,
    reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 10,
  })
  return { client, sockets, tokenProvider }
}

async function connectAndAuthenticate(
  client: RealtimeClient<TestServerEvents, TestClientEvents, TestRequestResults>,
  sockets: FakeWebSocket[],
  connectionId: string,
  accessTokenExpiresAt?: string,
  serverTime?: string,
): Promise<FakeWebSocket> {
  const connected = client.connect()
  await flushPromises()
  const socket = sockets.at(-1)
  if (!socket) throw new Error('Expected a realtime socket')
  socket.open()
  socket.receive('system.ready', ready(connectionId, accessTokenExpiresAt, serverTime))
  await connected
  return socket
}

describe('RealtimeClient connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('discards a stale token lookup after disconnect and creates only the new socket', async () => {
    let resolveFirstToken!: (token: string | null) => void
    const firstToken = new Promise<string | null>((resolve) => {
      resolveFirstToken = resolve
    })
    const tokenProvider = vi
      .fn<(forceRefresh: boolean) => Promise<string | null>>()
      .mockReturnValueOnce(firstToken)
      .mockResolvedValueOnce('new-session-token')
    const { client, sockets } = createHarness(tokenProvider)

    const staleConnectResult = client.connect().catch((error: unknown) => error)
    client.disconnect()
    const activeConnect = client.connect()
    await flushPromises()

    expect(sockets).toHaveLength(1)
    resolveFirstToken('stale-session-token')
    await flushPromises()
    expect(sockets).toHaveLength(1)

    sockets[0].open()
    const authenticate = JSON.parse(sockets[0].sent[0]) as {
      data: { accessToken: string }
    }
    expect(authenticate.data.accessToken).toBe('new-session-token')
    sockets[0].receive('system.ready', ready('connection-new'))

    await expect(activeConnect).resolves.toBeUndefined()
    await expect(staleConnectResult).resolves.toBeInstanceOf(Error)
    client.disconnect()
  })

  it('replays subscription recovery once on every authenticated socket', async () => {
    const { client, sockets } = createHarness()
    const recover = vi.fn()
    client.registerSubscriptionRecovery('workspace:workspace-1', recover)

    const connected = client.connect()
    await flushPromises()
    sockets[0].open()
    sockets[0].receive('system.ready', ready('connection-1'))
    await connected

    expect(recover).toHaveBeenCalledTimes(1)
    expect(recover).toHaveBeenLastCalledWith(ready('connection-1'))

    sockets[0].receive('system.ready', ready('connection-1'))
    expect(recover).toHaveBeenCalledTimes(1)

    sockets[0].serverClose(REALTIME_CLOSE_CODE.RESYNC_REQUIRED)
    await vi.advanceTimersByTimeAsync(20)
    expect(sockets).toHaveLength(2)
    sockets[1].open()
    sockets[1].receive('system.ready', ready('connection-2'))

    expect(recover).toHaveBeenCalledTimes(2)
    expect(recover).toHaveBeenLastCalledWith(ready('connection-2'))

    client.disconnect()
    const nextLogin = client.connect()
    await flushPromises()
    sockets[2].open()
    sockets[2].receive('system.ready', ready('connection-3'))
    await nextLogin

    expect(recover).toHaveBeenCalledTimes(2)
    client.disconnect()
  })

  it('uses one forced HTTP refresh for a 4401 reconnect and then stops', async () => {
    const tokenProvider = vi
      .fn<(forceRefresh: boolean) => Promise<string | null>>()
      .mockResolvedValueOnce('initial-token')
      .mockResolvedValueOnce('refreshed-token')
    const { client, sockets } = createHarness(tokenProvider)
    const firstSocket = await connectAndAuthenticate(client, sockets, 'connection-auth-1')

    firstSocket.serverClose(REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED)
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    expect(sockets).toHaveLength(2)
    expect(tokenProvider.mock.calls.map(([forceRefresh]) => forceRefresh)).toEqual([false, true])

    sockets[1].serverClose(REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED)
    expect(client.state).toBe('disconnected')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sockets).toHaveLength(2)
  })

  it('retries a transient forced-refresh failure without dropping the reconnect intent', async () => {
    const tokenProvider = vi
      .fn<(forceRefresh: boolean) => Promise<string | null>>()
      .mockResolvedValueOnce('initial-token')
      .mockRejectedValueOnce(new Error('refresh service unavailable'))
      .mockResolvedValueOnce('refreshed-token')
    const { client, sockets } = createHarness(tokenProvider)
    const firstSocket = await connectAndAuthenticate(
      client,
      sockets,
      'connection-transient-refresh-1',
    )

    firstSocket.serverClose(REALTIME_CLOSE_CODE.AUTHENTICATION_REQUIRED)
    await vi.advanceTimersByTimeAsync(20)
    await flushPromises()

    expect(tokenProvider.mock.calls.map(([forceRefresh]) => forceRefresh)).toEqual([
      false,
      true,
      true,
    ])
    expect(sockets).toHaveLength(2)
    sockets[1].open()
    sockets[1].receive('system.ready', ready('connection-transient-refresh-2'))
    expect(client.state).toBe('connected')
    client.disconnect()
  })

  it('treats 4403 as terminal and clears subscription recovery', async () => {
    const { client, sockets } = createHarness()
    const recover = vi.fn()
    client.registerSubscriptionRecovery('workspace:private', recover)
    const firstSocket = await connectAndAuthenticate(client, sockets, 'connection-terminal-1')
    expect(recover).toHaveBeenCalledTimes(1)

    firstSocket.serverClose(REALTIME_CLOSE_CODE.SESSION_TERMINATED)
    expect(client.state).toBe('disconnected')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sockets).toHaveLength(1)

    await connectAndAuthenticate(client, sockets, 'connection-terminal-2')
    expect(recover).toHaveBeenCalledTimes(1)
    client.disconnect()
  })

  it.each([
    {
      code: REALTIME_CLOSE_CODE.RATE_LIMITED,
      delayMs: 100,
      options: { rateLimitCooldownMs: 100 },
    },
    {
      code: 1013,
      delayMs: 50,
      options: { serverUnavailableCooldownMs: 50 },
    },
  ])(
    'waits for the configured cooldown before reconnecting after $code',
    async ({ code, delayMs, options }) => {
      const { client, sockets } = createHarness(undefined, options)
      const firstSocket = await connectAndAuthenticate(
        client,
        sockets,
        `connection-cooldown-${code}`,
      )

      firstSocket.serverClose(code)
      await vi.advanceTimersByTimeAsync(delayMs - 1)
      expect(sockets).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      await flushPromises()
      expect(sockets).toHaveLength(2)
      client.disconnect()
    },
  )

  it('abandons a stalled handshake and reconnects without rejecting connect()', async () => {
    const { client, sockets } = createHarness(undefined, {
      handshakeTimeoutMs: 50,
    })
    const connected = client.connect()
    await flushPromises()
    expect(sockets).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(49)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(21)
    await flushPromises()

    expect(sockets[0].closeCalls[0]).toEqual({
      code: 4000,
      reason: 'Realtime handshake timed out',
    })
    expect(sockets).toHaveLength(2)
    sockets[1].open()
    sockets[1].receive('system.ready', ready('connection-after-timeout'))

    await expect(connected).resolves.toBeUndefined()
    expect(client.state).toBe('connected')
    client.disconnect()
  })

  it('reconnects immediately when the transport emits an error', async () => {
    const { client, sockets } = createHarness()
    const connected = client.connect()
    await flushPromises()
    sockets[0].failTransport()
    await vi.advanceTimersByTimeAsync(20)
    await flushPromises()

    expect(sockets).toHaveLength(2)
    sockets[1].open()
    sockets[1].receive('system.ready', ready('connection-after-error'))
    await expect(connected).resolves.toBeUndefined()
    client.disconnect()
  })

  it('rejects oversized and backpressured outbound messages without silent loss', async () => {
    const { client, sockets } = createHarness(undefined, {
      maxOutboundMessageBytes: 256,
      maxBufferedAmountBytes: 256,
    })
    const socket = await connectAndAuthenticate(client, sockets, 'connection-outbound')

    expect(() =>
      client.send('workspace.subscribe', { workspaceId: 'x'.repeat(1_000) }),
    ).toThrowError(
      expect.objectContaining<Partial<RealtimeSendError>>({
        code: 'MESSAGE_TOO_LARGE',
      }),
    )
    await expect(
      client.request('workspace.subscribe', { workspaceId: 'x'.repeat(1_000) }),
    ).rejects.toMatchObject({ code: 'MESSAGE_TOO_LARGE' })

    socket.bufferedAmount = 250
    expect(() => client.send('workspace.subscribe', { workspaceId: 'workspace-1' })).toThrowError(
      expect.objectContaining<Partial<RealtimeSendError>>({
        code: 'BACKPRESSURE',
      }),
    )
    expect(() =>
      client.send('invalid' as 'workspace.subscribe', {
        workspaceId: 'workspace-1',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<RealtimeSendError>>({
        code: 'INVALID_EVENT',
      }),
    )
    expect(() =>
      client.send('auth.refresh' as 'workspace.subscribe', {
        workspaceId: 'workspace-1',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<RealtimeSendError>>({
        code: 'INVALID_EVENT',
      }),
    )
    await expect(
      client.request('system.ready' as 'workspace.subscribe', {
        workspaceId: 'workspace-1',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EVENT' })
    client.disconnect()
  })

  it('refreshes at half of a short token TTL and deduplicates watcher refresh', async () => {
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'))
    const tokenProvider = vi
      .fn<(forceRefresh: boolean) => Promise<string | null>>()
      .mockResolvedValueOnce('initial-token')
      .mockResolvedValueOnce('proactively-refreshed-token')
    const { client, sockets } = createHarness(tokenProvider)
    const socket = await connectAndAuthenticate(
      client,
      sockets,
      'connection-refresh',
      '2026-07-28T00:00:10.000Z',
    )

    await vi.advanceTimersByTimeAsync(4_999)
    expect(tokenProvider).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(tokenProvider).toHaveBeenCalledTimes(2)
    expect(tokenProvider).toHaveBeenLastCalledWith(true)

    const refreshMessages = socket.sent
      .map((raw) => JSON.parse(raw) as { event: string; requestId?: string })
      .filter(({ event }) => event === 'auth.refresh')
    expect(refreshMessages).toHaveLength(1)

    const watcherRefresh = client.refreshAuthentication()
    await flushPromises()
    expect(tokenProvider).toHaveBeenCalledTimes(2)
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw) as { event: string })
        .filter(({ event }) => event === 'auth.refresh'),
    ).toHaveLength(1)

    socket.receive(
      'system.ack',
      {
        event: 'auth.refresh',
        result: { accessTokenExpiresAt: '2026-07-28T00:01:10.000Z' },
      },
      refreshMessages[0].requestId,
    )
    await expect(watcherRefresh).resolves.toBeUndefined()
    client.disconnect()
  })

  it('uses server time when scheduling refresh for a skewed client clock', async () => {
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'))
    const tokenProvider = vi
      .fn<(forceRefresh: boolean) => Promise<string | null>>()
      .mockResolvedValueOnce('initial-token')
      .mockResolvedValueOnce('refreshed-token')
    const { client, sockets } = createHarness(tokenProvider)
    const socket = await connectAndAuthenticate(
      client,
      sockets,
      'connection-clock-skew',
      '2026-07-28T00:00:40.000Z',
      '2026-07-28T00:00:30.000Z',
    )

    await vi.advanceTimersByTimeAsync(4_999)
    expect(tokenProvider).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(tokenProvider).toHaveBeenLastCalledWith(true)

    const refreshMessage = socket.sent
      .map((raw) => JSON.parse(raw) as { event: string; requestId?: string })
      .find(({ event }) => event === 'auth.refresh')
    if (!refreshMessage?.requestId) throw new Error('Expected auth.refresh request')
    socket.receive(
      'system.ack',
      {
        event: 'auth.refresh',
        result: { accessTokenExpiresAt: '2026-07-28T00:01:40.000Z' },
      },
      refreshMessage.requestId,
    )
    await flushPromises()
    client.disconnect()
  })

  it('fails initial auth send and malformed ready messages as terminal protocol errors', async () => {
    const limited = createHarness(undefined, { maxOutboundMessageBytes: 16 })
    const limitedConnect = limited.client.connect().catch((error: unknown) => error)
    await flushPromises()
    limited.sockets[0].open()

    await expect(limitedConnect).resolves.toMatchObject({
      code: 'MESSAGE_TOO_LARGE',
    })
    expect(limited.sockets[0].closeCalls[0]?.code).toBe(4009)
    expect(limited.client.state).toBe('disconnected')

    const malformed = createHarness()
    const malformedConnect = malformed.client.connect().catch((error: unknown) => error)
    await flushPromises()
    malformed.sockets[0].open()
    malformed.sockets[0].receive('system.ready', {
      connectionId: 'connection-invalid',
      userId: 'user-1',
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      serverTime: '2026-07-28T00:00:00.000Z',
    })

    await expect(malformedConnect).resolves.toBeInstanceOf(Error)
    expect(malformed.sockets[0].closeCalls[0]?.code).toBe(4002)
    expect(malformed.client.state).toBe('disconnected')
  })

  it('fails malformed and non-text server frames instead of hanging', async () => {
    const malformed = createHarness()
    const malformedConnect = malformed.client.connect().catch((error: unknown) => error)
    await flushPromises()
    malformed.sockets[0].open()
    malformed.sockets[0].receiveRaw('{')

    await expect(malformedConnect).resolves.toBeInstanceOf(Error)
    expect(malformed.sockets[0].closeCalls[0]?.code).toBe(4002)

    const binary = createHarness()
    const binaryConnect = binary.client.connect().catch((error: unknown) => error)
    await flushPromises()
    binary.sockets[0].open()
    binary.sockets[0].receiveRaw(new Blob(['binary']))

    await expect(binaryConnect).resolves.toBeInstanceOf(Error)
    expect(binary.sockets[0].closeCalls[0]?.code).toBe(4003)

    const invalidEvent = createHarness()
    const invalidEventConnect = invalidEvent.client.connect().catch((error: unknown) => error)
    await flushPromises()
    invalidEvent.sockets[0].open()
    invalidEvent.sockets[0].receive('invalid', {})

    await expect(invalidEventConnect).resolves.toBeInstanceOf(Error)
    expect(invalidEvent.sockets[0].closeCalls[0]?.code).toBe(4002)
  })

  it('normalizes public disconnect codes and oversized close reasons for browsers', async () => {
    const { client, sockets } = createHarness()
    const socket = await connectAndAuthenticate(
      client,
      sockets,
      'connection-disconnect-normalization',
    )

    client.disconnect(1002, 'x'.repeat(200))

    expect(socket.closeCalls).toEqual([{ code: 4000, reason: 'Client disconnected' }])
    expect(client.state).toBe('disconnected')
  })

  it('isolates asynchronous event-listener failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client, sockets } = createHarness()
    client.on('system.ready', async () => {
      throw new Error('event listener failed')
    })

    await connectAndAuthenticate(client, sockets, 'connection-listener')
    await flushPromises()

    expect(consoleError).toHaveBeenCalledWith(
      '[realtime] "system.ready" listener failed',
      expect.any(Error),
    )
    client.disconnect()
  })

  it('does not let a stale event disposer remove a newer registration', async () => {
    const { client, sockets } = createHarness()
    const listener = vi.fn()
    const removeFirst = client.on('system.ready', listener)
    removeFirst()
    client.on('system.ready', listener)
    removeFirst()

    await connectAndAuthenticate(client, sockets, 'connection-new-listener')

    expect(listener).toHaveBeenCalledTimes(1)
    client.disconnect()
  })

  it('isolates synchronous and asynchronous state-listener failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client } = createHarness()
    const observer = vi.fn()

    client.onStateChange(() => {
      throw new Error('sync listener failed')
    })
    client.onStateChange(async () => {
      throw new Error('async listener failed')
    })
    client.onStateChange(observer)

    const pendingConnect = client.connect().catch(() => undefined)
    await flushPromises()

    expect(observer).toHaveBeenCalledWith('connecting')
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(2))
    client.disconnect()
    await pendingConnect
  })
})
