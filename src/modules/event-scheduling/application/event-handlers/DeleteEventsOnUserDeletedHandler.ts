import { UserDeletedEvent } from '../../../user/domain/events/UserDeleted';
import { IEventRepository } from '../ports/IEventRepository';
import { logger } from '../../../../shared/logger';

/**
 * Event handler that reacts to UserDeleted domain events and deletes all associated events.
 *
 * This handler decouples User Context from Event Scheduling Context by using domain events.
 * When a user is deleted, this handler automatically removes all their events (PENDING,
 * PROCESSING, COMPLETED, FAILED).
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (orchestrates domain logic)
 * **Dependencies:** Only Event Scheduling Context services and ports
 *
 * **Business Rule:** All events for the user (regardless of status) are deleted
 * when the user is deleted to maintain data consistency.
 *
 * @example
 * ```typescript
 * // Wire up at application startup
 * eventBus.subscribe('UserDeleted', async (event) => {
 *   await handler.handle(event);
 * });
 * ```
 */
export class DeleteEventsOnUserDeletedHandler {
  public constructor(private readonly eventRepository: IEventRepository) {}

  /**
   * Handle UserDeleted event by deleting all events for the user.
   *
   * Process:
   * 1. Call eventRepository.deleteByUserId() to remove all events
   * 2. This includes PENDING, PROCESSING, COMPLETED, and FAILED events
   *
   * @param event - UserDeleted domain event
   */
  public async handle(event: UserDeletedEvent): Promise<void> {
    try {
      // Delete all events for the user (cascade delete)
      await this.eventRepository.deleteByUserId(event.userId);
    } catch (error) {
      // Log error with event context for debugging
      logger.error({
        msg: 'Failed to delete events from UserDeleted event',
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
