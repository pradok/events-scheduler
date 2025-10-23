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
   * @returns Number of events rescheduled
   * @throws ZodError if validation fails
   * @throws UnsupportedEventTypeError if BIRTHDAY handler not registered
   */
  public async execute(dto: RescheduleBirthdayEventsDTO): Promise<number> {
    // Step 1: Validate input
    const validatedDto = RescheduleBirthdayEventsSchema.parse(dto);

    // Step 2: Query all events for user
    const allEvents = await this.eventRepository.findByUserId(validatedDto.userId);

    // Step 3: Filter to PENDING birthday events only
    const pendingBirthdayEvents = allEvents.filter(
      (e) => e.status === EventStatus.PENDING && e.eventType === 'BIRTHDAY'
    );

    if (pendingBirthdayEvents.length === 0) {
      return 0; // No events to reschedule
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

    for (const existingEvent of pendingBirthdayEvents) {
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

      // Persist updated event
      await this.eventRepository.update(rescheduledEvent);
    }

    return pendingBirthdayEvents.length;
  }
}
