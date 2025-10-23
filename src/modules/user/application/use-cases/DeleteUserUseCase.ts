import { DateTime } from 'luxon';
import type { IUserRepository } from '../ports/IUserRepository';
import type { IDomainEventBus } from '../../../../shared/events/IDomainEventBus';
import { UserNotFoundError } from '../../../../domain/errors/UserNotFoundError';
import type { UserDeletedEvent } from '../../domain/events/UserDeleted';

/**
 * DeleteUserUseCase - Delete a user and publish domain event for cascade delete
 *
 * This use case implements event-driven cascade delete pattern. When a user is deleted,
 * it publishes a UserDeleted domain event that is handled by the Event Scheduling Context
 * to delete all associated events.
 *
 * **Event Publishing:**
 * After deleting the user, publishes UserDeleted event that triggers event deletion
 * in the Event Scheduling Context.
 *
 * **Bounded Context Compliance:**
 * This use case has ZERO dependencies on Event Scheduling Context. Cross-context
 * communication happens exclusively via domain events, maintaining proper bounded
 * context separation per bounded-contexts.md.
 *
 * **Usage:**
 * ```typescript
 * const deleteUserUseCase = new DeleteUserUseCase(userRepository, eventBus);
 * await deleteUserUseCase.execute(userId);
 * console.log('User deleted and event deletion triggered');
 * ```
 *
 * **Throws:**
 * - UserNotFoundError if user does not exist (HTTP 404)
 * - InfrastructureError if database operation fails (HTTP 500)
 */
export class DeleteUserUseCase {
  /**
   * @param userRepository - Repository port for user persistence operations
   * @param eventBus - Domain event bus for publishing domain events
   */
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus: IDomainEventBus
  ) {}

  /**
   * Execute the use case to delete a user and publish domain event
   *
   * @param userId - UUID of the user to delete
   * @returns Promise that resolves when deletion is complete
   * @throws UserNotFoundError if user does not exist
   * @throws InfrastructureError if database operation fails
   */
  public async execute(userId: string): Promise<void> {
    // Verify user exists before attempting deletion
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    // Delete the user
    await this.userRepository.delete(userId);

    // Publish UserDeleted domain event
    const event: UserDeletedEvent = {
      eventType: 'UserDeleted',
      context: 'user',
      occurredAt: DateTime.utc().toISO(),
      aggregateId: userId,
      userId,
    };

    await this.eventBus.publish(event);
  }
}
