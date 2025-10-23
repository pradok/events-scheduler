/**
 * UserInfo - Data structure for user information needed by Event Scheduling context
 *
 * This interface represents the minimal user data needed to generate and schedule events.
 * It avoids coupling to the User bounded context by using primitive types instead of
 * importing User entity or value objects.
 *
 * **Bounded Context:** Event Scheduling Context
 * **Purpose:** Decouple from User Context while maintaining necessary data for event generation
 *
 * @example
 * ```typescript
 * const userInfo: UserInfo = {
 *   id: 'user-123',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   dateOfBirth: '1990-01-15',
 *   timezone: 'America/New_York'
 * };
 * ```
 */
export interface UserInfo {
  /** User ID */
  id: string;

  /** User's first name */
  firstName: string;

  /** User's last name */
  lastName: string;

  /** User's date of birth in ISO 8601 format (YYYY-MM-DD) */
  dateOfBirth: string;

  /** User's timezone in IANA timezone format (e.g., 'America/New_York') */
  timezone: string;
}
