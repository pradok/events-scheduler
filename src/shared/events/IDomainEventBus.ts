import { DomainEvent } from './DomainEvent';

/**
 * Domain Event Bus abstraction for publish-subscribe communication
 * between bounded contexts.
 *
 * Enables loose coupling between contexts by allowing them to communicate
 * via domain events instead of direct dependencies.
 *
 * @example
 * ```typescript
 * // Publisher (User Context)
 * await eventBus.publish({
 *   eventType: 'UserCreated',
 *   context: 'user',
 *   occurredAt: DateTime.now().toISO(),
 *   aggregateId: user.id,
 *   userId: user.id,
 *   firstName: user.firstName
 * });
 *
 * // Subscriber (Event Scheduling Context)
 * eventBus.subscribe('UserCreated', async (event) => {
 *   await createBirthdayEvent(event);
 * });
 * ```
 */
export interface IDomainEventBus {
  /**
   * Publish a domain event to all registered handlers.
   *
   * Handlers are executed sequentially in registration order.
   * If a handler throws an error, it is logged but other handlers continue.
   *
   * @param event - Domain event to publish
   * @returns Promise that resolves when all handlers complete
   *
   * @example
   * ```typescript
   * await eventBus.publish({
   *   eventType: 'UserCreated',
   *   context: 'user',
   *   occurredAt: DateTime.now().toISO(),
   *   aggregateId: 'user-123'
   * });
   * ```
   */
  publish<T extends DomainEvent>(event: T): Promise<void>;

  /**
   * Register an event handler for a specific event type.
   *
   * Multiple handlers can be registered for the same event type.
   * Handlers are executed in registration order.
   *
   * @param eventType - Event type identifier (e.g., "UserCreated")
   * @param handler - Async function to handle the event
   *
   * @example
   * ```typescript
   * eventBus.subscribe('UserCreated', async (event) => {
   *   console.log('User created:', event.aggregateId);
   *   await sendWelcomeEmail(event);
   * });
   * ```
   */
  subscribe<T extends DomainEvent>(eventType: string, handler: (event: T) => Promise<void>): void;
}
