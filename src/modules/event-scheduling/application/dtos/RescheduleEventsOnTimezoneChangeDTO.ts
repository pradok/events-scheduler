import { z } from 'zod';

/**
 * DTO for rescheduling events when user timezone changes
 *
 * This DTO represents the data needed to reschedule existing events
 * when a user's timezone changes. All PENDING events will be rescheduled
 * to maintain the same local time (e.g., 9:00 AM) but with updated UTC timestamps.
 *
 * **Usage:**
 * - Event handlers adapting domain events
 * - HTTP API endpoints (future)
 * - CLI commands (future)
 * - Batch jobs (future)
 */
export interface RescheduleEventsOnTimezoneChangeDTO {
  /** User ID */
  userId: string;

  /** User's new timezone in IANA timezone format (e.g., 'America/New_York') */
  newTimezone: string;
}

/**
 * Validation schema for RescheduleEventsOnTimezoneChangeDTO
 */
export const RescheduleEventsOnTimezoneChangeSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  newTimezone: z.string().min(1, 'Timezone is required'),
});
