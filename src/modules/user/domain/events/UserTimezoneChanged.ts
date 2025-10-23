import { DomainEvent } from '../../../../shared/events/DomainEvent';

/**
 * Domain event published when a user's timezone is changed.
 *
 * This event enables the Event Scheduling Context to recalculate UTC times
 * for PENDING events while maintaining the same local time (9:00 AM).
 *
 * **Published by:** User Context (UpdateUserUseCase)
 * **Subscribed by:** Event Scheduling Context (RescheduleEventsOnUserTimezoneChangedHandler)
 *
 * **Business Rule:** Only PENDING events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * @example
 * ```typescript
 * // Publishing the event
 * await eventBus.publish({
 *   eventType: 'UserTimezoneChanged',
 *   context: 'user',
 *   occurredAt: DateTime.now().toISO(),
 *   aggregateId: user.id,
 *   userId: user.id,
 *   oldTimezone: 'America/New_York',
 *   newTimezone: 'America/Los_Angeles',
 *   dateOfBirth: '1990-01-15'
 * });
 * ```
 */
export interface UserTimezoneChangedEvent extends DomainEvent {
  /**
   * Event type identifier (always 'UserTimezoneChanged')
   */
  eventType: 'UserTimezoneChanged';

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

  /**
   * Previous timezone as IANA timezone identifier
   * @example "America/New_York"
   */
  oldTimezone: string;

  /**
   * New timezone as IANA timezone identifier
   * @example "America/Los_Angeles"
   */
  newTimezone: string;

  /**
   * User's date of birth in ISO 8601 format (YYYY-MM-DD)
   * Required for recalculating next birthday occurrence
   * @example "1990-01-15"
   */
  dateOfBirth: string;
}
