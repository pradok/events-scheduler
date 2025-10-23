import { DateTime } from 'luxon';
import { UserInfo } from '../../../application/types/UserInfo';

/**
 * IEventHandler - Strategy interface for event-type-specific domain logic
 *
 * Each event type (BIRTHDAY, ANNIVERSARY, REMINDER, etc.) implements this interface
 * to provide custom behavior for domain-specific calculations and formatting.
 *
 * This follows the Strategy Pattern to enable extensibility without modifying
 * core scheduler or executor logic.
 *
 * **Bounded Context Compliance:**
 * Uses UserInfo interface (primitives) instead of User entity to avoid
 * cross-context dependencies. Event Scheduling context should NOT import
 * User entity from User context.
 *
 * **Design Decision:**
 * This interface contains ONLY domain logic (calculations, formatting).
 * Event entity creation/orchestration belongs in use cases, not here.
 * See: event-handlers-vs-use-cases.md for rationale.
 */
export interface IEventHandler {
  /**
   * The event type identifier (e.g., "BIRTHDAY", "ANNIVERSARY")
   */
  readonly eventType: string;

  /**
   * Calculate the next occurrence for this event type
   *
   * **Domain Rule:** Encapsulates business logic for when this event occurs
   *
   * @param userInfo - User data needed for calculation (primitives only)
   * @param referenceDate - The reference date (defaults to now, injectable for testing)
   * @returns DateTime representing the next occurrence at local time
   */
  calculateNextOccurrence(userInfo: UserInfo, referenceDate?: DateTime): DateTime;

  /**
   * Format the delivery message for this event type
   *
   * **Domain Rule:** Encapsulates business logic for message content
   *
   * @param userInfo - User data needed for message formatting (primitives only)
   * @returns Formatted message string
   */
  formatMessage(userInfo: UserInfo): string;
}
