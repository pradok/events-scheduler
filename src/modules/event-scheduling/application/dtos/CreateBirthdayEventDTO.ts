import { z } from 'zod';

/**
 * DTO for creating a birthday event
 *
 * This DTO represents the data needed to create a birthday event.
 * It uses primitive types only to avoid coupling to User Context.
 *
 * **Usage:**
 * - Event handlers adapting domain events
 * - HTTP API endpoints (future)
 * - CLI commands (future)
 * - Batch jobs (future)
 */
export interface CreateBirthdayEventDTO {
  /** User ID */
  userId: string;

  /** User's first name */
  firstName: string;

  /** User's last name */
  lastName: string;

  /** User's date of birth in ISO 8601 format (YYYY-MM-DD) */
  dateOfBirth: string;

  /** User's timezone in IANA timezone format (e.g., 'America/New_York') */
  timezone: string;
}

/**
 * Validation schema for CreateBirthdayEventDTO
 */
export const CreateBirthdayEventSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in ISO 8601 format (YYYY-MM-DD)'),
  timezone: z.string().min(1, 'Timezone is required'),
});
