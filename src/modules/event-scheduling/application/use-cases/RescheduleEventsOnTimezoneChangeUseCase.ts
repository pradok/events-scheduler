import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import {
  RescheduleEventsOnTimezoneChangeDTO,
  RescheduleEventsOnTimezoneChangeSchema,
} from '../dtos/RescheduleEventsOnTimezoneChangeDTO';

/**
 * Use case for rescheduling events when user timezone changes
 *
 * **Business Rule:** Only PENDING events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * **Key Behavior:** When timezone changes, targetTimestampLocal stays the same (9:00 AM),
 * but targetTimestampUTC is recalculated using the new timezone.
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
   * @returns Count of rescheduled events
   * @throws ZodError if input validation fails
   * @throws Error if repository operations fail
   */
  public async execute(dto: RescheduleEventsOnTimezoneChangeDTO): Promise<number> {
    // Step 1: Validate input
    RescheduleEventsOnTimezoneChangeSchema.parse(dto);

    // Step 2: Query all events for user
    const allEvents = await this.eventRepository.findByUserId(dto.userId);

    // Step 3: Filter to PENDING events only (all event types)
    const pendingEvents = allEvents.filter((e) => e.status === EventStatus.PENDING);

    if (pendingEvents.length === 0) {
      return 0; // No events to reschedule
    }

    // Step 4: Validate new timezone
    const newTimezone = new Timezone(dto.newTimezone);

    // Step 5: Reschedule each PENDING event
    let rescheduledCount = 0;

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
        dto.newTimezone
      );

      // Persist updated event
      await this.eventRepository.update(rescheduledEvent);
      rescheduledCount++;
    }

    return rescheduledCount;
  }
}
