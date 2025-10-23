import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { CreateUserDTO, CreateUserSchema } from '@shared/validation/schemas';
import { IUserRepository } from '../ports/IUserRepository';
import { IDomainEventBus } from '@shared/events/IDomainEventBus';
import { UserCreatedEvent } from '../../domain/events/UserCreated';
import { User } from '../../domain/entities/User';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '@shared/value-objects/Timezone';

/**
 * CreateUserUseCase - Application layer use case for creating users
 *
 * This use case orchestrates the creation of a User entity and publishes
 * a domain event to notify other bounded contexts. It follows the Hexagonal
 * Architecture pattern by depending only on port interfaces (IUserRepository,
 * IDomainEventBus) without any direct dependencies on Event Scheduling Context.
 *
 * **Bounded Context:** User Context
 * **Layer:** Application
 *
 * **Responsibilities:**
 * - Validate input using Zod schema
 * - Create User domain entity with value objects
 * - Persist user via IUserRepository
 * - Publish UserCreatedEvent to IDomainEventBus
 *
 * **Event-Driven Architecture:**
 * This use case publishes UserCreatedEvent after successful user creation.
 * Event Scheduling Context subscribes to this event to create birthday events,
 * ensuring complete decoupling between bounded contexts.
 *
 * **IMPORTANT:** This use case does NOT:
 * - Calculate birthdays (belongs to Event Scheduling Context)
 * - Create Event entities (belongs to Event Scheduling Context)
 * - Convert timezones (belongs to Event Scheduling Context)
 * - Depend on Event Scheduling services (violates bounded contexts)
 */
export class CreateUserUseCase {
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus: IDomainEventBus
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

    // Step 3: Persist user to database
    const savedUser = await this.userRepository.create(user);

    // Step 4: Publish UserCreatedEvent to notify other bounded contexts
    await this.publishUserCreatedEvent(savedUser);

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
   * Publish UserCreatedEvent to event bus
   *
   * This event notifies other bounded contexts (e.g., Event Scheduling Context)
   * that a new user has been created, allowing them to react accordingly
   * (e.g., create birthday events).
   *
   * @param user - The created user entity
   */
  private async publishUserCreatedEvent(user: User): Promise<void> {
    const event: UserCreatedEvent = {
      eventType: 'UserCreated',
      context: 'user',
      occurredAt: DateTime.now().toISO(),
      aggregateId: user.id,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth.toString(),
      timezone: user.timezone.toString(),
    };

    await this.eventBus.publish(event);
  }
}
