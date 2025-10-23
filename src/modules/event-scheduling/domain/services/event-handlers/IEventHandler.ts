import { DateTime } from 'luxon';
import { Event } from '../../entities/Event';
import { User } from '@modules/user/domain/entities/User';

/**
 * IEventHandler - Strategy interface for event-type-specific logic
 *
 * Each event type (BIRTHDAY, ANNIVERSARY, REMINDER, etc.) implements this interface
 * to provide custom behavior for generating events, formatting messages, and
 * calculating next occurrences.
 *
 * This follows the Strategy Pattern to enable extensibility without modifying
 * core scheduler or executor logic.
 */
export interface IEventHandler {
  /**
   * The event type identifier (e.g., "BIRTHDAY", "ANNIVERSARY")
   */
  readonly eventType: string;

  /**
   * Calculate the next occurrence for this event type
   *
   * @param user - The user for whom to calculate the next occurrence
   * @param referenceDate - The reference date (defaults to now, injectable for testing)
   * @returns DateTime representing the next occurrence at local time
   */
  calculateNextOccurrence(user: User, referenceDate?: DateTime): DateTime;

  /**
   * Format the delivery message for this event type
   *
   * @param user - The user for whom to format the message
   * @returns Formatted message string
   */
  formatMessage(user: User): string;

  /**
   * Generate a complete Event entity for this event type
   *
   * @param user - The user for whom to generate the event
   * @returns Event entity ready to be persisted
   */
  generateEvent(user: User): Event;
}
