import type { IUserRepository } from '../ports/IUserRepository';
import type { IEventRepository } from '../../../event-scheduling/application/ports/IEventRepository';
import type { TimezoneService } from '../../../event-scheduling/domain/services/TimezoneService';
import type { EventHandlerRegistry } from '../../../event-scheduling/domain/services/event-handlers/EventHandlerRegistry';
import type { User } from '../../domain/entities/User';
import { UserNotFoundError } from '../../../../domain/errors/UserNotFoundError';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { EventStatus } from '../../../event-scheduling/domain/value-objects/EventStatus';
import type { UpdateUserDTO } from '../../../../shared/validation/schemas';

/**
 * UpdateUserUseCase - Update user properties and reschedule events when necessary
 *
 * This use case handles partial updates to user data and implements complex
 * event rescheduling logic when birthday or timezone changes.
 *
 * **Event Rescheduling Logic:**
 *
 * 1. **Birthday Change:** If dateOfBirth is updated, all PENDING birthday events
 *    are rescheduled to the new birthday date at 9:00 AM in user's timezone.
 *
 * 2. **Timezone Change:** If timezone is updated, all PENDING events are
 *    rescheduled to maintain the same local time (9:00 AM) in the new timezone.
 *
 * 3. **Combined Changes:** If both birthday AND timezone are updated, birthday
 *    logic is applied first, then timezone logic.
 *
 * **Critical Rule:** Only PENDING events are rescheduled. Events with status
 * PROCESSING, COMPLETED, or FAILED are never modified (they are historical records).
 *
 * **Cross-Context Dependency:**
 * This use case depends on IEventRepository, TimezoneService, and EventHandlerRegistry
 * from the Event Scheduling bounded context. This is acceptable for synchronous
 * business logic that must maintain consistency between users and their events.
 *
 * **Usage:**
 * ```typescript
 * const updateUserUseCase = new UpdateUserUseCase(
 *   userRepository,
 *   eventRepository,
 *   timezoneService,
 *   eventHandlerRegistry
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
   * @param eventRepository - Repository port for event persistence operations
   * @param timezoneService - Service for timezone conversions
   * @param eventHandlerRegistry - Registry for event type handlers (birthday, etc.)
   */
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  /**
   * Execute the use case to update user and reschedule events if needed
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

    // Track original values for comparison
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

    // 4. Reschedule events if birthday or timezone changed
    const birthdayChanged =
      dto.dateOfBirth !== undefined && !updatedUser.dateOfBirth.equals(oldDateOfBirth);
    const timezoneChanged = dto.timezone !== undefined && !updatedUser.timezone.equals(oldTimezone);

    if (birthdayChanged || timezoneChanged) {
      await this.rescheduleEvents(updatedUser, birthdayChanged, timezoneChanged);
    }

    return updatedUser;
  }

  /**
   * Reschedule PENDING events when birthday or timezone changes
   *
   * @param user - Updated user entity with new birthday/timezone
   * @param birthdayChanged - Whether birthday was updated
   * @param timezoneChanged - Whether timezone was updated
   */
  private async rescheduleEvents(
    user: User,
    birthdayChanged: boolean,
    timezoneChanged: boolean
  ): Promise<void> {
    // Fetch all events for user
    const allEvents = await this.eventRepository.findByUserId(user.id);

    // Filter to PENDING events only (never modify PROCESSING, COMPLETED, FAILED)
    const pendingEvents = allEvents.filter((event) => event.status === EventStatus.PENDING);

    if (pendingEvents.length === 0) {
      return; // No events to reschedule
    }

    // Apply rescheduling logic
    for (const event of pendingEvents) {
      let needsUpdate = false;
      let newTargetTimestampLocal = event.targetTimestampLocal;
      let newTargetTimezone = event.targetTimezone;

      // Birthday change: recalculate next occurrence
      if (birthdayChanged && event.eventType === 'BIRTHDAY') {
        const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');
        newTargetTimestampLocal = handler.calculateNextOccurrence(user);
        newTargetTimezone = user.timezone.toString();
        needsUpdate = true;
      }

      // Timezone change: keep local time, recalculate UTC
      if (timezoneChanged) {
        newTargetTimezone = user.timezone.toString();
        needsUpdate = true;
      }

      if (needsUpdate) {
        // Convert local time to UTC using new timezone
        const newTargetTimestampUTC = this.timezoneService.convertToUTC(
          newTargetTimestampLocal,
          user.timezone
        );

        // Reschedule event using immutable method
        const rescheduledEvent = event.reschedule(
          newTargetTimestampUTC,
          newTargetTimestampLocal,
          newTargetTimezone
        );

        // Persist updated event
        await this.eventRepository.update(rescheduledEvent);
      }
    }
  }
}
