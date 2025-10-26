import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { Timezone } from '@shared/value-objects/Timezone';
import { UserInfo } from '../types/UserInfo';
import { CreateBirthdayEventDTO, CreateBirthdayEventSchema } from '../dtos/CreateBirthdayEventDTO';
import { IWebhookConfig } from '../../config/webhook-config';

/**
 * Use Case: Create a birthday event for a user
 *
 * This use case contains the orchestration logic for creating birthday events.
 * It can be triggered by:
 * - Domain event (UserCreated) via event handler
 * - HTTP API (POST /users/:id/events) (future)
 * - CLI command (future)
 * - Batch job (future)
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (orchestrates domain logic)
 *
 * **Design Pattern:** Use Case Pattern (from Clean Architecture)
 * - Reusable business logic
 * - Independent of event bus
 * - Easy to test
 * - Can be called from multiple entry points
 *
 * @example
 * ```typescript
 * const useCase = new CreateBirthdayEventUseCase(
 *   eventRepository,
 *   timezoneService,
 *   eventHandlerRegistry
 * );
 *
 * const event = await useCase.execute({
 *   userId: 'user-123',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   dateOfBirth: '1990-01-15',
 *   timezone: 'America/New_York'
 * });
 * ```
 */
export class CreateBirthdayEventUseCase {
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    private readonly webhookConfig: IWebhookConfig
  ) {}

  /**
   * Execute the use case to create a birthday event
   *
   * Process:
   * 1. Validate input DTO
   * 2. Create UserInfo from DTO
   * 3. Get BirthdayEventHandler from registry
   * 4. Calculate next birthday at 9:00 AM local time
   * 5. Convert to UTC
   * 6. Generate idempotency key
   * 7. Create Event entity
   * 8. Persist to database
   *
   * @param dto - Data needed to create birthday event
   * @returns Created Event entity
   * @throws ZodError if validation fails
   * @throws UnsupportedEventTypeError if BIRTHDAY handler not registered
   */
  public async execute(dto: CreateBirthdayEventDTO): Promise<Event> {
    // Step 1: Validate input
    const validatedDto = CreateBirthdayEventSchema.parse(dto);

    // Step 2: Create UserInfo from DTO
    const userInfo: UserInfo = {
      id: validatedDto.userId,
      firstName: validatedDto.firstName,
      lastName: validatedDto.lastName,
      dateOfBirth: validatedDto.dateOfBirth,
      timezone: validatedDto.timezone,
    };

    // Step 3: Get BirthdayEventHandler from registry
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');

    // Step 4: Calculate next birthday at 9:00 AM local time
    const nextBirthdayLocal = handler.calculateNextOccurrence(userInfo);

    // Step 5: Convert to UTC
    const timezone = new Timezone(validatedDto.timezone);
    const nextBirthdayUTC = this.timezoneService.convertToUTC(nextBirthdayLocal, timezone);

    // Step 6: Generate idempotency key
    const idempotencyKey = IdempotencyKey.generate(validatedDto.userId, nextBirthdayUTC);

    // Step 7: Create Event entity
    const webhookUrl = this.webhookConfig.getWebhookUrl(validatedDto.userId, 'BIRTHDAY');

    const birthdayEvent = new Event({
      id: randomUUID(),
      userId: validatedDto.userId,
      eventType: 'BIRTHDAY',
      status: EventStatus.PENDING,
      targetTimestampUTC: nextBirthdayUTC,
      targetTimestampLocal: nextBirthdayLocal,
      targetTimezone: validatedDto.timezone,
      idempotencyKey,
      deliveryPayload: {
        message: handler.formatMessage(userInfo),
        webhookUrl,
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

    return birthdayEvent;
  }
}
