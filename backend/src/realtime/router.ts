import { ZodType } from 'zod'
import { eventNameSchema, isRealtimeControlEvent } from './protocol'

export class RealtimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'RealtimeError'
  }
}

export interface RealtimeHandlerContext {
  readonly connectionId: string
  readonly userId: string
  send(event: string, data?: unknown): void
  join(channel: string): void
  leave(channel: string): void
  publish(channel: string, event: string, data?: unknown): void
}

export type RealtimeHandler<T> = (
  context: RealtimeHandlerContext,
  data: T,
) => unknown | Promise<unknown>

interface RegisteredHandler<T = unknown> {
  schema: ZodType<T>
  handle: RealtimeHandler<T>
}

export class RealtimeRouter {
  private readonly handlers = new Map<string, RegisteredHandler>()

  register<T>(event: string, schema: ZodType<T>, handler: RealtimeHandler<T>): () => void {
    // 이벤트 이름과 payload 검증을 중앙 라우터가 담당해 각 실시간 도메인 핸들러가
    // 검증되지 않은 데이터를 직접 다루지 않게 한다.
    if (!eventNameSchema.safeParse(event).success) {
      throw new Error(`Invalid realtime event name "${event}"`)
    }
    if (isRealtimeControlEvent(event)) {
      throw new Error(`Realtime control event "${event}" is reserved by the protocol`)
    }
    if (this.handlers.has(event)) {
      throw new Error(`A realtime handler is already registered for "${event}"`)
    }

    const registeredHandler = { schema, handle: handler } as RegisteredHandler
    this.handlers.set(event, registeredHandler)
    return () => {
      // 재시작/테스트 중 같은 이름으로 새 등록이 생겼다면 이전 해제 함수가 지우지 못하게 한다.
      if (this.handlers.get(event) === registeredHandler) {
        this.handlers.delete(event)
      }
    }
  }

  async dispatch(
    event: string,
    rawData: unknown,
    context: RealtimeHandlerContext,
  ): Promise<unknown> {
    const handler = this.handlers.get(event)
    if (!handler) {
      throw new RealtimeError('UNKNOWN_EVENT', `No handler is registered for "${event}"`)
    }

    const parsed = handler.schema.safeParse(rawData)
    if (!parsed.success) {
      throw new RealtimeError('INVALID_EVENT_DATA', 'The event data is invalid')
    }

    return handler.handle(context, parsed.data)
  }
}
