import { DomainEvent } from '../../../../shared/events/DomainEvent';

/**
 * Domain event published when a user account is deleted.
 *
 * This event enables the Event Scheduling Context to delete all associated
 * events without direct dependencies between bounded contexts.
 *
 * **Published by:** User Context (DeleteUserUseCase)
 * **Subscribed by:** Event Scheduling Context (DeleteEventsOnUserDeletedHandler)
 *
 * **Business Rule:** All events for the user (PENDING, PROCESSING, COMPLETED, FAILED)
 * should be deleted when the user is deleted.
 *
 * @example
 * ```typescript
 * // Publishing the event
 * await eventBus.publish({
 *   eventType: 'UserDeleted',
 *   context: 'user',
 *   occurredAt: DateTime.now().toISO(),
 *   aggregateId: userId,
 *   userId: userId
 * });
 * ```
 */
export interface UserDeletedEvent extends DomainEvent {
  /**
   * Event type identifier (always 'UserDeleted')
   */
  eventType: 'UserDeleted';

  /**
   * Bounded context name (always 'user')
   */
  context: 'user';

  /**
   * ISO 8601 timestamp when the event occurred
   */
  occurredAt: string;

  /**
   * ID of the aggregate root (User ID)
   */
  aggregateId: string;

  /**
   * User ID (same as aggregateId, included for clarity)
   */
  userId: string;
}
