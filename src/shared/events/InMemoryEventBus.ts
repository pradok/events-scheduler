import { DomainEvent } from './DomainEvent';
import { IDomainEventBus } from './IDomainEventBus';

/**
 * In-memory implementation of domain event bus for Phase 1 (MVP).
 *
 * Executes event handlers sequentially in registration order.
 * Errors in individual handlers are logged but don't prevent
 * other handlers from executing (resilient event processing).
 *
 * **Performance:** Suitable for monolith with in-process communication (<1ms latency).
 * **Migration Path:** Swap with EventBridgeEventBus in Phase 2 for microservices.
 *
 * @example
 * ```typescript
 * const eventBus = new InMemoryEventBus();
 *
 * // Register handlers
 * eventBus.subscribe('UserCreated', async (event) => {
 *   await createBirthdayEvent(event);
 * });
 *
 * // Publish event
 * await eventBus.publish({
 *   eventType: 'UserCreated',
 *   context: 'user',
 *   occurredAt: DateTime.now().toISO(),
 *   aggregateId: 'user-123'
 * });
 * ```
 */
export class InMemoryEventBus implements IDomainEventBus {
  /**
   * Map of event types to handler arrays.
   * Key: Event type (e.g., "UserCreated")
   * Value: Array of handler functions
   */
  private readonly handlers: Map<string, Array<(event: DomainEvent) => Promise<void>>>;

  public constructor() {
    this.handlers = new Map();
  }

  /**
   * Register an event handler for a specific event type.
   *
   * Multiple handlers can be registered for the same event type.
   * Handlers are stored in registration order and executed sequentially.
   *
   * @param eventType - Event type identifier (e.g., "UserCreated")
   * @param handler - Async function to handle the event
   */
  public subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => Promise<void>
  ): void {
    const existingHandlers = this.handlers.get(eventType);

    if (!existingHandlers) {
      // First handler for this event type
      this.handlers.set(eventType, [handler as (event: DomainEvent) => Promise<void>]);
    } else {
      // Add to existing handlers array
      existingHandlers.push(handler as (event: DomainEvent) => Promise<void>);
    }
  }

  /**
   * Publish a domain event to all registered handlers.
   *
   * **Execution Strategy:**
   * - Handlers execute sequentially (NOT parallel) in registration order
   * - If a handler throws, error is logged and processing continues
   * - All handlers receive the same event object
   *
   * **Error Handling:**
   * - Individual handler failures don't prevent other handlers from executing
   * - Errors are logged with structured context for debugging
   * - No errors are thrown to caller (resilient design)
   *
   * @param event - Domain event to publish
   * @returns Promise that resolves when all handlers complete (or fail)
   */
  public async publish<T extends DomainEvent>(event: T): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventType);

    // No handlers registered for this event type - no-op
    if (!eventHandlers || eventHandlers.length === 0) {
      return;
    }

    // Execute handlers sequentially (preserves ordering, prevents race conditions)
    for (let i = 0; i < eventHandlers.length; i++) {
      const handler = eventHandlers[i];

      if (!handler) {
        continue; // Skip undefined handlers (should never happen)
      }

      try {
        await handler(event);
      } catch (error) {
        // Log error but continue processing other handlers (resilient)
        console.error('Domain event handler failed', {
          eventType: event.eventType,
          context: event.context,
          aggregateId: event.aggregateId,
          handlerIndex: i,
          totalHandlers: eventHandlers.length,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        // DO NOT rethrow - continue to next handler
      }
    }
  }
}
