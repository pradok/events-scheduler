import type { IUserRepository } from '../ports/IUserRepository';
import type { IEventRepository } from '../../../event-scheduling/application/ports/IEventRepository';
import { UserNotFoundError } from '../../../../domain/errors/UserNotFoundError';

/**
 * DeleteUserUseCase - Delete a user and cascade delete all associated events
 *
 * This use case implements the cascade delete pattern to ensure data consistency.
 * When a user is deleted, all their pending, completed, and failed events are also removed.
 *
 * **Transaction Behavior:**
 * This use case should be wrapped in a database transaction by the repository implementation
 * to ensure atomicity. Either both user AND events are deleted, or neither is deleted.
 *
 * **Cross-Context Dependency:**
 * This use case depends on IEventRepository from the Event Scheduling bounded context.
 * This is acceptable for cascade delete operations which must be atomic.
 *
 * **Usage:**
 * ```typescript
 * const deleteUserUseCase = new DeleteUserUseCase(userRepository, eventRepository);
 * await deleteUserUseCase.execute(userId);
 * console.log('User and all events deleted successfully');
 * ```
 *
 * **Throws:**
 * - UserNotFoundError if user does not exist (HTTP 404)
 * - InfrastructureError if database operation fails (HTTP 500)
 */
export class DeleteUserUseCase {
  /**
   * @param userRepository - Repository port for user persistence operations
   * @param eventRepository - Repository port for event persistence operations
   */
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventRepository: IEventRepository
  ) {}

  /**
   * Execute the use case to delete a user and all associated events
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

    // Delete all events for this user (cascade delete)
    await this.eventRepository.deleteByUserId(userId);

    // Delete the user
    await this.userRepository.delete(userId);
  }
}
