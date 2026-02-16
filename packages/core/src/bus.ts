import { v7 as uuidv7 } from "uuid";
import type {
  EventBus,
  AegisEvent,
  EventFilter,
  EventHandler,
  Subscription,
  EventTopic,
  TraceContext,
  EventId,
  SpanId,
  TraceId,
} from "@aegis/types";

/**
 * In-memory implementation of the Aegis Event Bus.
 */
export class InMemoryEventBus implements EventBus {
  private subscribers = new Set<{
    filter: EventFilter;
    handler: EventHandler<unknown>;
    id: string;
  }>();

  async publish<T>(event: AegisEvent<T>): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const sub of this.subscribers) {
      if (this.matches(event, sub.filter)) {
        try {
          const result = sub.handler(event);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (err) {
          // TODO: emit system.error event?
          console.error("Error in event handler:", err);
        }
      }
    }

    // Fire and forget (but we await generic promises for finding errors?)
    // The interface says Promise<void>, implying we wait for dispatch.
    // Spec says "fire-and-forget broadcast".
    // I'll await them to ensure handlers complete if they are async.
    await Promise.allSettled(promises);
  }

  subscribe<T>(filter: EventFilter, handler: EventHandler<T>): Subscription {
    const id = uuidv7();
    const sub = { filter, handler: handler as EventHandler<unknown>, id };
    this.subscribers.add(sub);

    return {
      id,
      unsubscribe: () => {
        this.subscribers.delete(sub);
      },
    };
  }

  request<TReq, TRes>(
    event: AegisEvent<TReq>,
    replyFilter: EventFilter,
    timeoutMs: number
  ): Promise<AegisEvent<TRes>> {
    return new Promise((resolve, reject) => {
      let sub: Subscription;
      const timeout = setTimeout(() => {
        sub?.unsubscribe();
        reject(new Error(`Timeout waiting for response to event ${event.id}`));
      }, timeoutMs);

      const handler: EventHandler<TRes> = (replyEvent) => {
        clearTimeout(timeout);
        sub.unsubscribe();
        resolve(replyEvent);
      };

      sub = this.subscribe(replyFilter, handler);
      this.publish(event).catch((err) => {
        clearTimeout(timeout);
        sub.unsubscribe();
        reject(err);
      });
    });
  }

  private matches(event: AegisEvent, filter: EventFilter): boolean {
    if (filter.topics && !filter.topics.includes(event.topic)) {
      return false;
    }
    if (filter.sourceAgentId && event.sourceAgentId !== filter.sourceAgentId) {
      return false;
    }
    if (filter.targetAgentId && event.targetAgentId !== filter.targetAgentId) {
      return false;
    }
    if (filter.predicate && !filter.predicate(event)) {
      return false;
    }
    return true;
  }
}

/**
 * Helper to create a new event with a fresh ID and timestamp.
 */
export function createEvent<T>(
  topic: EventTopic,
  payload: T,
  traceCtx: TraceContext,
  sourceAgentId?: string,
  targetAgentId?: string
): AegisEvent<T> {
  return {
    id: uuidv7() as EventId,
    topic,
    payload,
    traceCtx,
    timestamp: new Date().toISOString(),
    sourceAgentId: sourceAgentId as any,
    targetAgentId: targetAgentId as any,
  };
}

/**
 * Helper to create a root trace context.
 */
export function createTraceContext(parent?: TraceContext): TraceContext {
  if (parent) {
    return {
      traceId: parent.traceId,
      spanId: uuidv7() as SpanId,
      parentSpanId: parent.spanId,
    };
  }
  return {
    traceId: uuidv7() as TraceId,
    spanId: uuidv7() as SpanId,
  };
}
