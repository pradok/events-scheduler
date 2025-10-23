import { DateTime } from 'luxon';
import type { IUserRepository } from '../ports/IUserRepository';
import type { IDomainEventBus } from '../../../../shared/events/IDomainEventBus';
import type { User } from '../../domain/entities/User';
import { UserNotFoundError } from '../../../../domain/errors/UserNotFoundError';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import type { UpdateUserDTO } from '../../../../shared/validation/schemas';
import type { UserBirthdayChangedEvent } from '../../domain/events/UserBirthdayChanged';
import type { UserTimezoneChangedEvent } from '../../domain/events/UserTimezoneChanged';

/**
 * UpdateUserUseCase - Update user properties and publish domain events
 *
 * This use case handles partial updates to user data using event-driven architecture.
 * When birthday or timezone changes, it publishes domain events that are handled
 * by the Event Scheduling Context to reschedule events.
 *
 * **Event Publishing:**
 *
 * 1. **Birthday Change:** Publishes UserBirthdayChanged event
 * 2. **Timezone Change:** Publishes UserTimezoneChanged event
 * 3. **Combined Changes:** Publishes both events
 *
 * **Bounded Context Compliance:**
 * This use case has ZERO dependencies on Event Scheduling Context. Cross-context
 * communication happens exclusively via domain events, maintaining proper bounded
 * context separation per bounded-contexts.md.
 *
 * **Usage:**
 * ```typescript
 * const updateUserUseCase = new UpdateUserUseCase(
 *   userRepository,
 *   eventBus
 * );
 * const updatedUser = await updateUserUseCase.execute(userId, {
 *   firstName: 'Jane',
 *   dateOfBirth: '1990-02-14',
 *   timezone: 'America/Los_Angeles'
 * });
 * ```
 *
 * **Throws:**
 * - UserNotFoundError if user does not exist (HTTP 404)
 * - ValidationError if input validation fails (HTTP 400)
 * - InfrastructureError if database operation fails (HTTP 500)
 */
export class UpdateUserUseCase {
  /**
   * @param userRepository - Repository port for user persistence operations
   * @param eventBus - Domain event bus for publishing domain events
   */
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus: IDomainEventBus
  ) {}

  /**
   * Execute the use case to update user and publish domain events if needed
   *
   * @param userId - UUID of the user to update
   * @param dto - Partial update data (only provided fields are updated)
   * @returns Updated User entity
   * @throws UserNotFoundError if user does not exist
   * @throws ValidationError if input validation fails
   * @throws InfrastructureError if database operation fails
   */
  public async execute(userId: string, dto: UpdateUserDTO): Promise<User> {
    // 1. Fetch existing user
    let user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    // Track original values for event publishing
    const oldDateOfBirth = user.dateOfBirth;
    const oldTimezone = user.timezone;

    // 2. Update user properties using immutable methods
    // Update name if provided
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const newFirstName = dto.firstName ?? user.firstName;
      const newLastName = dto.lastName ?? user.lastName;
      user = user.updateName(newFirstName, newLastName);
    }

    // Update date of birth if provided
    if (dto.dateOfBirth !== undefined) {
      user = user.updateDateOfBirth(new DateOfBirth(dto.dateOfBirth));
    }

    // Update timezone if provided
    if (dto.timezone !== undefined) {
      user = user.updateTimezone(new Timezone(dto.timezone));
    }

    // 3. Save updated user
    const updatedUser = await this.userRepository.update(user);

    // 4. Publish domain events if birthday or timezone changed
    const birthdayChanged =
      dto.dateOfBirth !== undefined && !updatedUser.dateOfBirth.equals(oldDateOfBirth);
    const timezoneChanged = dto.timezone !== undefined && !updatedUser.timezone.equals(oldTimezone);

    if (birthdayChanged) {
      await this.publishUserBirthdayChangedEvent(
        updatedUser,
        oldDateOfBirth.toString(),
        updatedUser.dateOfBirth.toString()
      );
    }

    if (timezoneChanged) {
      await this.publishUserTimezoneChangedEvent(
        updatedUser,
        oldTimezone.toString(),
        updatedUser.timezone.toString()
      );
    }

    return updatedUser;
  }

  /**
   * Publish UserBirthdayChanged domain event
   *
   * @param user - Updated user entity
   * @param oldDateOfBirth - Previous date of birth (YYYY-MM-DD)
   * @param newDateOfBirth - New date of birth (YYYY-MM-DD)
   */
  private async publishUserBirthdayChangedEvent(
    user: User,
    oldDateOfBirth: string,
    newDateOfBirth: string
  ): Promise<void> {
    const event: UserBirthdayChangedEvent = {
      eventType: 'UserBirthdayChanged',
      context: 'user',
      occurredAt: DateTime.utc().toISO(),
      aggregateId: user.id,
      userId: user.id,
      oldDateOfBirth,
      newDateOfBirth,
      timezone: user.timezone.toString(),
    };

    await this.eventBus.publish(event);
  }

  /**
   * Publish UserTimezoneChanged domain event
   *
   * @param user - Updated user entity
   * @param oldTimezone - Previous timezone (IANA format)
   * @param newTimezone - New timezone (IANA format)
   */
  private async publishUserTimezoneChangedEvent(
    user: User,
    oldTimezone: string,
    newTimezone: string
  ): Promise<void> {
    const event: UserTimezoneChangedEvent = {
      eventType: 'UserTimezoneChanged',
      context: 'user',
      occurredAt: DateTime.utc().toISO(),
      aggregateId: user.id,
      userId: user.id,
      oldTimezone,
      newTimezone,
      dateOfBirth: user.dateOfBirth.toString(),
    };

    await this.eventBus.publish(event);
  }
}
