import { UserCreatedEvent } from '../../../user/domain/events/UserCreated';
import { CreateBirthdayEventUseCase } from '../use-cases/CreateBirthdayEventUseCase';
import { logger } from '../../../../shared/logger';

/**
 * Event handler that reacts to UserCreated domain events.
 *
 * This is a THIN ADAPTER that delegates to CreateBirthdayEventUseCase.
 * Business logic lives in the use case, not here.
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (adapter to use case)
 * **Responsibility:** Adapt UserCreated event payload to CreateBirthdayEventDTO
 *
 * **Design Pattern:** Thin Event Handler (from event-handlers-vs-use-cases.md)
 * - Handler is just an adapter (5-10 lines)
 * - Use case contains all orchestration logic
 * - Use case can be called from multiple entry points (event, API, CLI, batch)
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
  public constructor(private readonly createBirthdayEventUseCase: CreateBirthdayEventUseCase) {}

  /**
   * Handle UserCreated event by delegating to use case
   *
   * @param event - UserCreated domain event
   */
  public async handle(event: UserCreatedEvent): Promise<void> {
    try {
      // Adapt event payload to use case DTO
      await this.createBirthdayEventUseCase.execute({
        userId: event.userId,
        firstName: event.firstName,
        lastName: event.lastName,
        dateOfBirth: event.dateOfBirth,
        timezone: event.timezone,
      });
    } catch (error) {
      // Log event context for debugging
      logger.error({
        msg: 'Failed to create birthday event from UserCreated event',
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
