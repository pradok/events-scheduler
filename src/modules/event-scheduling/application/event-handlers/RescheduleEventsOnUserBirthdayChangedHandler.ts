import { DateTime } from 'luxon';
import { UserBirthdayChangedEvent } from '../../../user/domain/events/UserBirthdayChanged';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { DateOfBirth } from '../../../user/domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { User } from '../../../user/domain/entities/User';

/**
 * Event handler that reacts to UserBirthdayChanged domain events and reschedules birthday events.
 *
 * This handler decouples User Context from Event Scheduling Context by using domain events.
 * When a user's birthday is updated, this handler automatically reschedules their PENDING birthday events.
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (orchestrates domain logic)
 * **Dependencies:** Only Event Scheduling Context services and ports
 *
 * **Business Rule:** Only PENDING birthday events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * @example
 * ```typescript
 * // Wire up at application startup
 * eventBus.subscribe('UserBirthdayChanged', async (event) => {
 *   await handler.handle(event);
 * });
 * ```
 */
export class RescheduleEventsOnUserBirthdayChangedHandler {
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  /**
   * Handle UserBirthdayChanged event by rescheduling PENDING birthday events.
   *
   * Process:
   * 1. Query all events for the user
   * 2. Filter to PENDING birthday events only
   * 3. For each PENDING event:
   *    a. Calculate new next birthday using BirthdayEventHandler
   *    b. Convert to UTC using TimezoneService
   *    c. Reschedule event (immutable update with version increment)
   *    d. Persist via eventRepository.update()
   *
   * @param event - UserBirthdayChanged domain event
   */
  public async handle(event: UserBirthdayChangedEvent): Promise<void> {
    try {
      // Step 1: Query all events for user
      const allEvents = await this.eventRepository.findByUserId(event.userId);

      // Step 2: Filter to PENDING birthday events only
      const pendingBirthdayEvents = allEvents.filter(
        (e) => e.status === EventStatus.PENDING && e.eventType === 'BIRTHDAY'
      );

      if (pendingBirthdayEvents.length === 0) {
        return; // No events to reschedule
      }

      // Step 3: Reconstruct User value objects from event payload
      const dateOfBirth = new DateOfBirth(event.newDateOfBirth);
      const timezone = new Timezone(event.timezone);

      // Create lightweight User representation (only properties needed for calculation)
      const user = new User({
        id: event.userId,
        firstName: 'User', // Not needed for calculation but required for validation
        lastName: 'User', // Not needed for calculation but required for validation
        dateOfBirth,
        timezone,
        createdAt: DateTime.fromISO(event.occurredAt),
        updatedAt: DateTime.fromISO(event.occurredAt),
      });

      // Step 4: Get BirthdayEventHandler from registry
      const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');

      // Step 5: Reschedule each PENDING birthday event
      for (const existingEvent of pendingBirthdayEvents) {
        // Calculate new next birthday at 9:00 AM local time
        const nextBirthdayLocal = handler.calculateNextOccurrence(user);

        // Convert to UTC
        const nextBirthdayUTC = this.timezoneService.convertToUTC(nextBirthdayLocal, timezone);

        // Reschedule event (immutable update with version increment)
        const rescheduledEvent = existingEvent.reschedule(
          nextBirthdayUTC,
          nextBirthdayLocal,
          event.timezone
        );

        // Persist updated event
        await this.eventRepository.update(rescheduledEvent);
      }
    } catch (error) {
      // Log error with event context for debugging
      console.error('Failed to reschedule birthday events from UserBirthdayChanged event', {
        eventType: event.eventType,
        userId: event.userId,
        aggregateId: event.aggregateId,
        oldDateOfBirth: event.oldDateOfBirth,
        newDateOfBirth: event.newDateOfBirth,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Rethrow error to be handled by event bus error handling
      throw error;
    }
  }
}
