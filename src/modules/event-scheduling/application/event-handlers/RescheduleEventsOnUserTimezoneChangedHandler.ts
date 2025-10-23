import { UserTimezoneChangedEvent } from '../../../user/domain/events/UserTimezoneChanged';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { Timezone } from '../../../../shared/value-objects/Timezone';

/**
 * Event handler that reacts to UserTimezoneChanged domain events and reschedules events.
 *
 * This handler decouples User Context from Event Scheduling Context by using domain events.
 * When a user's timezone is updated, this handler recalculates UTC times for PENDING events
 * while maintaining the same local time (9:00 AM).
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (orchestrates domain logic)
 * **Dependencies:** Only Event Scheduling Context services and ports
 *
 * **Business Rule:** Only PENDING events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * **Key Behavior:** When timezone changes, targetTimestampLocal stays the same (9:00 AM),
 * but targetTimestampUTC is recalculated using the new timezone.
 *
 * @example
 * ```typescript
 * // Wire up at application startup
 * eventBus.subscribe('UserTimezoneChanged', async (event) => {
 *   await handler.handle(event);
 * });
 * ```
 */
export class RescheduleEventsOnUserTimezoneChangedHandler {
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService
  ) {}

  /**
   * Handle UserTimezoneChanged event by recalculating UTC times for PENDING events.
   *
   * Process:
   * 1. Query all events for the user
   * 2. Filter to PENDING events only (all types)
   * 3. For each PENDING event:
   *    a. Keep targetTimestampLocal unchanged (9:00 AM)
   *    b. Recalculate targetTimestampUTC using new timezone
   *    c. Reschedule event (immutable update with version increment)
   *    d. Persist via eventRepository.update()
   *
   * @param event - UserTimezoneChanged domain event
   */
  public async handle(event: UserTimezoneChangedEvent): Promise<void> {
    try {
      // Step 1: Query all events for user
      const allEvents = await this.eventRepository.findByUserId(event.userId);

      // Step 2: Filter to PENDING events only (all event types)
      const pendingEvents = allEvents.filter((e) => e.status === EventStatus.PENDING);

      if (pendingEvents.length === 0) {
        return; // No events to reschedule
      }

      // Step 3: Validate new timezone
      const newTimezone = new Timezone(event.newTimezone);

      // Step 4: Reschedule each PENDING event
      for (const existingEvent of pendingEvents) {
        // Keep local time unchanged (e.g., 9:00 AM)
        const targetTimestampLocal = existingEvent.targetTimestampLocal;

        // Recalculate UTC time using new timezone
        const newTargetTimestampUTC = this.timezoneService.convertToUTC(
          targetTimestampLocal,
          newTimezone
        );

        // Reschedule event (immutable update with version increment)
        const rescheduledEvent = existingEvent.reschedule(
          newTargetTimestampUTC,
          targetTimestampLocal,
          event.newTimezone
        );

        // Persist updated event
        await this.eventRepository.update(rescheduledEvent);
      }
    } catch (error) {
      // Log error with event context for debugging
      console.error('Failed to reschedule events from UserTimezoneChanged event', {
        eventType: event.eventType,
        userId: event.userId,
        aggregateId: event.aggregateId,
        oldTimezone: event.oldTimezone,
        newTimezone: event.newTimezone,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Rethrow error to be handled by event bus error handling
      throw error;
    }
  }
}
