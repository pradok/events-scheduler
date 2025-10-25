/**
 * Event Delivery Time Configuration
 *
 * Defines when different event types should be delivered to users.
 * These are code constants (not database-driven) because:
 * - Delivery times change infrequently (business constants)
 * - Zero database queries needed (instant access)
 * - Type-safe at compile time
 * - Easy testing (pass custom config to handler constructors)
 * - Version controlled in git
 *
 * Usage:
 * ```typescript
 * // Production: Use default delivery time
 * const handler = new BirthdayEventHandler();
 *
 * // Testing: Override delivery time for fast test execution
 * const testConfig = { hour: 15, minute: 30 }; // 3:30 PM
 * const handler = new BirthdayEventHandler(testConfig);
 * ```
 */

/**
 * Configuration for event delivery time of day
 * @property hour - Hour of day (0-23) in user's timezone
 * @property minute - Minute of hour (0-59)
 */
export interface EventDeliveryTimeConfig {
  hour: number; // 0-23
  minute: number; // 0-59
}

/**
 * Delivery times for all event types
 *
 * BIRTHDAY: 9:00 AM (business requirement)
 * - Users expect birthday greetings in the morning
 * - Early enough to be one of the first messages they see
 * - Not too early to wake users in different timezones
 *
 * Future event types can be added here:
 * - ANNIVERSARY: { hour: 12, minute: 0 }
 * - REMINDER: { hour: 15, minute: 0 }
 */
export const EVENT_DELIVERY_TIMES = {
  BIRTHDAY: {
    hour: 9,
    minute: 0,
  },
} as const;
