import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { Timezone } from '@shared/value-objects/Timezone';
import { UserInfo } from '../types/UserInfo';
import {
  RescheduleBirthdayEventsDTO,
  RescheduleBirthdayEventsSchema,
} from '../dtos/RescheduleBirthdayEventsDTO';
import { RescheduleEventsResult } from '../types/RescheduleEventsResult';
import { OptimisticLockError } from '../../../../domain/errors/OptimisticLockError';
import { logger } from '../../../../shared/logger';

/**
 * Use Case: Reschedule birthday events when user's birthday changes
 *
 * This use case contains the orchestration logic for rescheduling birthday events.
 * It can be triggered by:
 * - Domain event (UserBirthdayChanged) via event handler
 * - HTTP API (PUT /users/:id/events/reschedule) (future)
 * - CLI command (future)
 * - Batch job (future)
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (orchestrates domain logic)
 *
 * **Business Rule:** Only PENDING birthday events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * **Race Condition Protection:**
 * Events in PROCESSING state are skipped with a warning log. This prevents race conditions
 * when the recovery service or scheduler is executing an event at the same time the user
 * updates their birthday. Optimistic locking provides a second layer of protection.
 *
 * **Design Pattern:** Use Case Pattern (from Clean Architecture)
 * - Reusable business logic
 * - Independent of event bus
 * - Easy to test
 * - Can be called from multiple entry points
 *
 * @example
 * ```typescript
 * const useCase = new RescheduleBirthdayEventsUseCase(
 *   eventRepository,
 *   timezoneService,
 *   eventHandlerRegistry
 * );
 *
 * await useCase.execute({
 *   userId: 'user-123',
 *   newDateOfBirth: '1990-02-20',
 *   timezone: 'America/New_York'
 * });
 * ```
 */
export class RescheduleBirthdayEventsUseCase {
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  /**
   * Execute the use case to reschedule birthday events
   *
   * Process:
   * 1. Validate input DTO
   * 2. Query all events for the user
   * 3. Filter to PENDING birthday events only
   * 4. Create UserInfo from DTO
   * 5. For each PENDING event:
   *    a. Calculate new next birthday using BirthdayEventHandler
   *    b. Convert to UTC using TimezoneService
   *    c. Reschedule event (immutable update with version increment)
   *    d. Persist via eventRepository.update()
   *
   * @param dto - Data needed to reschedule birthday events
   * @returns RescheduleEventsResult with counts of rescheduled and skipped events
   * @throws ZodError if validation fails
   * @throws UnsupportedEventTypeError if BIRTHDAY handler not registered
   */
  public async execute(dto: RescheduleBirthdayEventsDTO): Promise<RescheduleEventsResult> {
    // Step 1: Validate input
    const validatedDto = RescheduleBirthdayEventsSchema.parse(dto);

    // Step 2: Query all events for user
    const allEvents = await this.eventRepository.findByUserId(validatedDto.userId);

    // Step 3: Filter to PENDING birthday events only
    const pendingBirthdayEvents = allEvents.filter(
      (e) => e.status === EventStatus.PENDING && e.eventType === 'BIRTHDAY'
    );

    if (pendingBirthdayEvents.length === 0) {
      return {
        rescheduledCount: 0,
        skippedCount: 0,
        totalPendingCount: 0,
        skippedEventIds: [],
      };
    }

    // Step 4: Create UserInfo from DTO
    const userInfo: UserInfo = {
      id: validatedDto.userId,
      firstName: '', // Not needed for calculation
      lastName: '', // Not needed for calculation
      dateOfBirth: validatedDto.newDateOfBirth,
      timezone: validatedDto.timezone,
    };

    // Step 5: Get BirthdayEventHandler from registry
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');

    // Step 6: Reschedule each PENDING birthday event
    const timezone = new Timezone(validatedDto.timezone);
    let rescheduledCount = 0;
    let skippedCount = 0;
    const skippedEventIds: string[] = [];

    for (const existingEvent of pendingBirthdayEvents) {
      // Skip events that are already being processed (race condition protection)
      if (existingEvent.status === EventStatus.PROCESSING) {
        logger.warn({
          msg: 'Skipping reschedule for event in PROCESSING state',
          eventId: existingEvent.id,
          userId: validatedDto.userId,
          currentStatus: existingEvent.status,
          reason: 'Event is currently being executed and cannot be safely rescheduled',
        });
        skippedCount++;
        skippedEventIds.push(existingEvent.id);
        continue;
      }

      try {
        // Calculate new next birthday at 9:00 AM local time
        const nextBirthdayLocal = handler.calculateNextOccurrence(userInfo);

        // Convert to UTC
        const nextBirthdayUTC = this.timezoneService.convertToUTC(nextBirthdayLocal, timezone);

        // Reschedule event (immutable update with version increment)
        const rescheduledEvent = existingEvent.reschedule(
          nextBirthdayUTC,
          nextBirthdayLocal,
          validatedDto.timezone
        );

        // Persist updated event (optimistic locking will catch concurrent modifications)
        await this.eventRepository.update(rescheduledEvent);
        rescheduledCount++;
      } catch (error) {
        // Handle optimistic lock errors (event was modified by another process)
        if (error instanceof OptimisticLockError) {
          logger.warn({
            msg: 'Event was modified during reschedule (optimistic lock conflict), skipping',
            eventId: existingEvent.id,
            userId: validatedDto.userId,
            error: error.message,
          });
          skippedCount++;
          skippedEventIds.push(existingEvent.id);
          // Continue to next event - don't fail the entire operation
          continue;
        }
        // Rethrow unexpected errors
        throw error;
      }
    }

    return {
      rescheduledCount,
      skippedCount,
      totalPendingCount: pendingBirthdayEvents.length,
      skippedEventIds,
    };
  }
}
