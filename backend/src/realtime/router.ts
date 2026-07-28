import { ZodType } from 'zod';
import { eventNameSchema } from './protocol';

export class RealtimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'RealtimeError';
  }
}

export interface RealtimeHandlerContext {
  readonly connectionId: string;
  readonly userId: string;
  send(event: string, data?: unknown): void;
  join(channel: string): void;
  leave(channel: string): void;
  publish(channel: string, event: string, data?: unknown): void;
}

export type RealtimeHandler<T> = (
  context: RealtimeHandlerContext,
  data: T,
) => unknown | Promise<unknown>;

interface RegisteredHandler<T = unknown> {
  schema: ZodType<T>;
  handle: RealtimeHandler<T>;
}

export class RealtimeRouter {
  private readonly handlers = new Map<string, RegisteredHandler>();

  register<T>(event: string, schema: ZodType<T>, handler: RealtimeHandler<T>): () => void {
    if (!eventNameSchema.safeParse(event).success) {
      throw new Error(`Invalid realtime event name "${event}"`);
    }
    if (this.handlers.has(event)) {
      throw new Error(`A realtime handler is already registered for "${event}"`);
    }

    this.handlers.set(event, { schema, handle: handler } as RegisteredHandler);
    return () => {
      this.handlers.delete(event);
    };
  }

  async dispatch(
    event: string,
    rawData: unknown,
    context: RealtimeHandlerContext,
  ): Promise<unknown> {
    const handler = this.handlers.get(event);
    if (!handler) {
      throw new RealtimeError('UNKNOWN_EVENT', `No handler is registered for "${event}"`);
    }

    const parsed = handler.schema.safeParse(rawData);
    if (!parsed.success) {
      throw new RealtimeError('INVALID_EVENT_DATA', 'The event data is invalid');
    }

    return handler.handle(context, parsed.data);
  }
}
