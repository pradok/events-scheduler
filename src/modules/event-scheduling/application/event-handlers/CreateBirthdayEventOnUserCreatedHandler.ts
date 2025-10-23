import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { UserCreatedEvent } from '../../../user/domain/events/UserCreated';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { DateOfBirth } from '../../../user/domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { User } from '../../../user/domain/entities/User';

/**
 * Event handler that reacts to UserCreated domain events and generates birthday events.
 *
 * This handler decouples User Context from Event Scheduling Context by using domain events.
 * When a user is created, this handler automatically schedules their next birthday event.
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (orchestrates domain logic)
 * **Dependencies:** Only Event Scheduling Context services and ports
 *
 * @example
 * ```typescript
 * // Wire up at application startup
 * eventBus.subscribe('UserCreated', async (event) => {
 *   await handler.handle(event);
 * });
 * ```
 */
export class CreateBirthdayEventOnUserCreatedHandler {
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  /**
   * Handle UserCreated event by creating a birthday event.
   *
   * Process:
   * 1. Reconstruct User value objects from event payload
   * 2. Get BirthdayEventHandler from registry
   * 3. Calculate next birthday at 9:00 AM local time
   * 4. Convert to UTC
   * 5. Create Event entity
   * 6. Persist to database
   *
   * @param event - UserCreated domain event
   */
  public async handle(event: UserCreatedEvent): Promise<void> {
    try {
      // Step 1: Reconstruct User value objects from event payload
      const dateOfBirth = new DateOfBirth(event.dateOfBirth);
      const timezone = new Timezone(event.timezone);

      // Step 2: Create lightweight User representation (only properties needed for event generation)
      const user = new User({
        id: event.userId,
        firstName: event.firstName,
        lastName: event.lastName,
        dateOfBirth,
        timezone,
        createdAt: DateTime.fromISO(event.occurredAt),
        updatedAt: DateTime.fromISO(event.occurredAt),
      });

      // Step 3: Get BirthdayEventHandler from registry
      const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');

      // Step 4: Calculate next birthday at 9:00 AM local time
      const nextBirthdayLocal = handler.calculateNextOccurrence(user);

      // Step 5: Convert to UTC
      const nextBirthdayUTC = this.timezoneService.convertToUTC(nextBirthdayLocal, timezone);

      // Step 6: Generate idempotency key
      const idempotencyKey = IdempotencyKey.generate(event.userId, nextBirthdayUTC);

      // Step 7: Create Event entity
      const birthdayEvent = new Event({
        id: randomUUID(),
        userId: event.userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: nextBirthdayUTC,
        targetTimestampLocal: nextBirthdayLocal,
        targetTimezone: timezone.toString(),
        idempotencyKey,
        deliveryPayload: {
          message: handler.formatMessage(user),
        },
        version: 1,
        retryCount: 0,
        executedAt: null,
        failureReason: null,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Step 8: Persist Event
      await this.eventRepository.create(birthdayEvent);
    } catch (error) {
      // Log error with event context for debugging
      console.error('Failed to create birthday event from UserCreated event', {
        eventType: event.eventType,
        userId: event.userId,
        aggregateId: event.aggregateId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Rethrow error to be handled by event bus error handling
      throw error;
    }
  }
}
