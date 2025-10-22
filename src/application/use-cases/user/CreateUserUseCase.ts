import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { CreateUserDTO, CreateUserSchema } from '../../../shared/validation/schemas';
import { IUserRepository } from '../../ports/IUserRepository';
import { IEventRepository } from '../../ports/IEventRepository';
import { TimezoneService } from '../../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../../domain/services/event-handlers/EventHandlerRegistry';
import { User } from '../../../domain/entities/User';
import { Event } from '../../../domain/entities/Event';
import { DateOfBirth } from '../../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../domain/value-objects/Timezone';
import { EventStatus } from '../../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../../domain/value-objects/IdempotencyKey';

/**
 * CreateUserUseCase - Application layer use case for creating users
 *
 * This use case orchestrates the creation of a User entity and its corresponding
 * Birthday event in a single operation. It follows the Hexagonal Architecture
 * pattern by depending only on port interfaces (IUserRepository, IEventRepository)
 * and domain services (TimezoneService, EventHandlerRegistry).
 *
 * Responsibilities:
 * - Validate input using Zod schema
 * - Create User domain entity with value objects
 * - Use Strategy Pattern (EventHandlerRegistry) to calculate next birthday
 * - Create Event domain entity with calculated timestamps
 * - Persist both user and event via repository interfaces
 *
 * Transaction atomicity is handled by the repository layer. This use case
 * calls both repositories sequentially, and the infrastructure layer ensures
 * that both operations succeed or both fail.
 */
export class CreateUserUseCase {
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  /**
   * Execute the CreateUser use case
   *
   * @param dto - Input DTO with user data (validated by Zod schema)
   * @returns The created User entity
   * @throws ZodError if input validation fails
   * @throws InvalidTimezoneError if timezone is invalid
   * @throws InvalidDateOfBirthError if date of birth is invalid
   * @throws Error if repository operations fail
   */
  public async execute(dto: CreateUserDTO): Promise<User> {
    // Step 1: Validate input using Zod schema
    const validatedDto = CreateUserSchema.parse(dto);

    // Step 2: Create User domain entity with value objects
    const user = this.createUserEntity(validatedDto);

    // Step 3: Calculate next birthday using Strategy Pattern
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');
    const nextBirthdayLocal = handler.calculateNextOccurrence(user);
    const nextBirthdayUTC = this.timezoneService.convertToUTC(nextBirthdayLocal, user.timezone);

    // Step 4: Create Event domain entity
    const event = this.createEventEntity(user, nextBirthdayLocal, nextBirthdayUTC, handler);

    // Step 5: Persist user and event (transaction atomicity handled by repository layer)
    const savedUser = await this.userRepository.create(user);
    await this.eventRepository.create(event);

    return savedUser;
  }

  /**
   * Create User domain entity from validated DTO
   *
   * @param dto - Validated input DTO
   * @returns User entity
   * @throws InvalidTimezoneError if timezone is invalid
   * @throws InvalidDateOfBirthError if date of birth is invalid
   */
  private createUserEntity(dto: CreateUserDTO): User {
    return new User({
      id: randomUUID(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: new DateOfBirth(dto.dateOfBirth),
      timezone: new Timezone(dto.timezone),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });
  }

  /**
   * Create Event domain entity for birthday
   *
   * @param user - The user for whom to create the event
   * @param nextBirthdayLocal - Next birthday at 9:00 AM local time
   * @param nextBirthdayUTC - Next birthday in UTC
   * @param handler - Birthday event handler (for formatting message)
   * @returns Event entity
   */
  private createEventEntity(
    user: User,
    nextBirthdayLocal: DateTime,
    nextBirthdayUTC: DateTime,
    handler: { formatMessage: (user: User) => string }
  ): Event {
    return new Event({
      id: randomUUID(),
      userId: user.id,
      eventType: 'BIRTHDAY',
      status: EventStatus.PENDING,
      targetTimestampUTC: nextBirthdayUTC,
      targetTimestampLocal: nextBirthdayLocal,
      targetTimezone: user.timezone.toString(),
      idempotencyKey: IdempotencyKey.generate(user.id, nextBirthdayUTC),
      deliveryPayload: { message: handler.formatMessage(user) },
      version: 1,
      retryCount: 0,
      executedAt: null,
      failureReason: null,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });
  }
}
