import { DomainEvent } from '../../../../shared/events/DomainEvent';

/**
 * Domain event published when a new user is created.
 *
 * This event enables bounded contexts to react to user creation without
 * direct dependencies. Event Scheduling Context subscribes to this event
 * to generate birthday events.
 *
 * **Published by:** User Context (CreateUserUseCase)
 * **Subscribed by:** Event Scheduling Context (CreateBirthdayEventOnUserCreatedHandler)
 *
 * @example
 * ```typescript
 * // Publishing the event
 * await eventBus.publish({
 *   eventType: 'UserCreated',
 *   context: 'user',
 *   occurredAt: DateTime.now().toISO(),
 *   aggregateId: user.id,
 *   userId: user.id,
 *   firstName: user.firstName,
 *   lastName: user.lastName,
 *   dateOfBirth: user.dateOfBirth.toString(),
 *   timezone: user.timezone.toString()
 * });
 * ```
 */
export interface UserCreatedEvent extends DomainEvent {
  /**
   * Event type identifier (always 'UserCreated')
   */
  eventType: 'UserCreated';

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
   * User's first name
   */
  firstName: string;

  /**
   * User's last name
   */
  lastName: string;

  /**
   * User's date of birth in ISO 8601 format (YYYY-MM-DD)
   * @example "1990-01-15"
   */
  dateOfBirth: string;

  /**
   * User's timezone as IANA timezone identifier
   * @example "America/New_York", "Europe/London", "Asia/Tokyo"
   */
  timezone: string;
}
