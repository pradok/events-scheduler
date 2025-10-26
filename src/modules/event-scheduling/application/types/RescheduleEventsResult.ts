/**
 * Result object returned by event rescheduling use cases
 *
 * This provides detailed information about which events were successfully
 * rescheduled and which were skipped due to being in PROCESSING state.
 *
 * **Use Cases:**
 * - RescheduleBirthdayEventsUseCase
 * - RescheduleEventsOnTimezoneChangeUseCase
 *
 * **Purpose:**
 * When a user updates their birthday or timezone, some events might already be
 * in the middle of execution (PROCESSING state). These events cannot be safely
 * rescheduled due to race conditions, so they are skipped with a warning.
 *
 * This result object allows the API to inform the user about skipped events.
 *
 * @example
 * ```typescript
 * const result = await rescheduleBirthdayEventsUseCase.execute(dto);
 *
 * if (result.skippedCount > 0) {
 *   // Inform user: "2 events could not be rescheduled because they are
 *   // currently being processed. They will execute with the old birthday."
 * }
 * ```
 */
export interface RescheduleEventsResult {
  /**
   * Number of events successfully rescheduled
   */
  rescheduledCount: number;

  /**
   * Number of events skipped because they were in PROCESSING state
   *
   * These events are currently being executed and cannot be safely
   * modified due to race conditions with the recovery service or
   * normal scheduler execution.
   */
  skippedCount: number;

  /**
   * Total number of PENDING events found before filtering
   *
   * This helps distinguish between:
   * - No events to reschedule (totalPendingCount = 0)
   * - All events were skipped (totalPendingCount > 0, rescheduledCount = 0)
   */
  totalPendingCount: number;

  /**
   * Event IDs that were skipped due to PROCESSING state
   *
   * Useful for logging and debugging
   */
  skippedEventIds: string[];
}
