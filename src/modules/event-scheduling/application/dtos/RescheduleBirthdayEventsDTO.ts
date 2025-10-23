import { z } from 'zod';

/**
 * DTO for rescheduling birthday events
 *
 * This DTO represents the data needed to reschedule existing birthday events
 * when a user's birthday changes.
 *
 * **Usage:**
 * - Event handlers adapting domain events
 * - HTTP API endpoints (future)
 * - CLI commands (future)
 * - Batch jobs (future)
 */
export interface RescheduleBirthdayEventsDTO {
  /** User ID */
  userId: string;

  /** User's new date of birth in ISO 8601 format (YYYY-MM-DD) */
  newDateOfBirth: string;

  /** User's timezone in IANA timezone format (e.g., 'America/New_York') */
  timezone: string;
}

/**
 * Validation schema for RescheduleBirthdayEventsDTO
 */
export const RescheduleBirthdayEventsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  newDateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in ISO 8601 format (YYYY-MM-DD)'),
  timezone: z.string().min(1, 'Timezone is required'),
});
