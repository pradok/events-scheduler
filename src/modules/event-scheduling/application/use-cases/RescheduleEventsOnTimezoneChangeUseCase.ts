import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import {
  RescheduleEventsOnTimezoneChangeDTO,
  RescheduleEventsOnTimezoneChangeSchema,
} from '../dtos/RescheduleEventsOnTimezoneChangeDTO';
import { RescheduleEventsResult } from '../types/RescheduleEventsResult';
import { OptimisticLockError } from '../../../../domain/errors/OptimisticLockError';
import { logger } from '../../../../shared/logger';

/**
 * Use case for rescheduling events when user timezone changes
 *
 * **Business Rule:** Only PENDING events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * **Key Behavior:** When timezone changes, targetTimestampLocal stays the same (9:00 AM),
 * but targetTimestampUTC is recalculated using the new timezone.
 *
 * **Race Condition Protection:**
 * Events in PROCESSING state are skipped with a warning log. This prevents race conditions
 * when the recovery service or scheduler is executing an event at the same time the user
 * updates their timezone. Optimistic locking provides a second layer of protection.
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (orchestrates domain logic)
 *
 * This use case can be invoked from:
 * - Event handlers (UserTimezoneChanged domain event)
 * - HTTP API endpoints (future)
 * - CLI commands (future)
 * - Batch jobs (future)
 *
 * @example
 * ```typescript
 * const dto: RescheduleEventsOnTimezoneChangeDTO = {
 *   userId: 'user-123',
 *   newTimezone: 'Europe/London',
 * };
 * const count = await useCase.execute(dto);
 * console.log(`Rescheduled ${count} events`);
 * ```
 */
export class RescheduleEventsOnTimezoneChangeUseCase {
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService
  ) {}

  /**
   * Execute the use case to reschedule events for timezone change
   *
   * Process:
   * 1. Validate input DTO
   * 2. Query all events for the user
   * 3. Filter to PENDING events only (all types)
   * 4. For each PENDING event:
   *    a. Keep targetTimestampLocal unchanged (9:00 AM)
   *    b. Recalculate targetTimestampUTC using new timezone
   *    c. Reschedule event (immutable update with version increment)
   *    d. Persist via eventRepository.update()
   *
   * @param dto - Data transfer object with userId and newTimezone
   * @returns RescheduleEventsResult with counts of rescheduled and skipped events
   * @throws ZodError if input validation fails
   * @throws Error if repository operations fail
   */
  public async execute(dto: RescheduleEventsOnTimezoneChangeDTO): Promise<RescheduleEventsResult> {
    // Step 1: Validate input
    RescheduleEventsOnTimezoneChangeSchema.parse(dto);

    // Step 2: Query all events for user
    const allEvents = await this.eventRepository.findByUserId(dto.userId);

    // Step 3: Filter to PENDING events only (all event types)
    const pendingEvents = allEvents.filter((e) => e.status === EventStatus.PENDING);

    if (pendingEvents.length === 0) {
      return {
        rescheduledCount: 0,
        skippedCount: 0,
        totalPendingCount: 0,
        skippedEventIds: [],
      };
    }

    // Step 4: Validate new timezone
    const newTimezone = new Timezone(dto.newTimezone);

    // Step 5: Reschedule each PENDING event
    let rescheduledCount = 0;
    let skippedCount = 0;
    const skippedEventIds: string[] = [];

    for (const existingEvent of pendingEvents) {
      // Skip events that are already being processed (race condition protection)
      if (existingEvent.status === EventStatus.PROCESSING) {
        logger.warn({
          msg: 'Skipping reschedule for event in PROCESSING state',
          eventId: existingEvent.id,
          userId: dto.userId,
          currentStatus: existingEvent.status,
          reason: 'Event is currently being executed and cannot be safely rescheduled',
        });
        skippedCount++;
        skippedEventIds.push(existingEvent.id);
        continue;
      }

      try {
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
          dto.newTimezone
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
            userId: dto.userId,
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
      totalPendingCount: pendingEvents.length,
      skippedEventIds,
    };
  }
}
