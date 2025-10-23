import { DomainEvent } from '../../../../shared/events/DomainEvent';

/**
 * Domain event published when a user's date of birth is changed.
 *
 * This event enables the Event Scheduling Context to reschedule PENDING
 * birthday events without direct dependencies between bounded contexts.
 *
 * **Published by:** User Context (UpdateUserUseCase)
 * **Subscribed by:** Event Scheduling Context (RescheduleEventsOnUserBirthdayChangedHandler)
 *
 * **Business Rule:** Only PENDING events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * @example
 * ```typescript
 * // Publishing the event
 * await eventBus.publish({
 *   eventType: 'UserBirthdayChanged',
 *   context: 'user',
 *   occurredAt: DateTime.now().toISO(),
 *   aggregateId: user.id,
 *   userId: user.id,
 *   oldDateOfBirth: '1990-01-15',
 *   newDateOfBirth: '1990-02-14',
 *   timezone: 'America/New_York'
 * });
 * ```
 */
export interface UserBirthdayChangedEvent extends DomainEvent {
  /**
   * Event type identifier (always 'UserBirthdayChanged')
   */
  eventType: 'UserBirthdayChanged';

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
   * Previous date of birth in ISO 8601 format (YYYY-MM-DD)
   * @example "1990-01-15"
   */
  oldDateOfBirth: string;

  /**
   * New date of birth in ISO 8601 format (YYYY-MM-DD)
   * @example "1990-02-14"
   */
  newDateOfBirth: string;

  /**
   * User's current timezone as IANA timezone identifier
   * @example "America/New_York", "Europe/London", "Asia/Tokyo"
   */
  timezone: string;
}
