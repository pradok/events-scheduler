/**
 * Base interface for all domain events in the system.
 *
 * Domain events represent significant business occurrences that other
 * bounded contexts may need to react to. Events are immutable records
 * of what happened in the past.
 *
 * @example
 * ```typescript
 * interface UserCreatedEvent extends DomainEvent {
 *   eventType: 'UserCreated';
 *   context: 'user';
 *   firstName: string;
 *   lastName: string;
 * }
 * ```
 */
export interface DomainEvent {
  /**
   * Event type identifier (e.g., "UserCreated", "UserDeleted")
   * Used by event bus to route events to appropriate handlers.
   */
  eventType: string;

  /**
   * Bounded context name that published this event (e.g., "user", "event-scheduling")
   * Helps identify the source domain of the event.
   */
  context: string;

  /**
   * ISO 8601 timestamp when the event occurred (e.g., "2025-10-23T14:30:00.000Z")
   * Must be in UTC timezone for consistency.
   */
  occurredAt: string;

  /**
   * ID of the aggregate root that emitted this event
   * Usually the entity ID (e.g., User ID, Event ID)
   */
  aggregateId: string;
}
