import { UserBirthdayChangedEvent } from '../../../user/domain/events/UserBirthdayChanged';
import { RescheduleBirthdayEventsUseCase } from '../use-cases/RescheduleBirthdayEventsUseCase';

/**
 * Event handler that reacts to UserBirthdayChanged domain events.
 *
 * This is a THIN ADAPTER that delegates to RescheduleBirthdayEventsUseCase.
 * Business logic lives in the use case, not here.
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (adapter to use case)
 * **Responsibility:** Adapt UserBirthdayChanged event payload to RescheduleBirthdayEventsDTO
 *
 * **Design Pattern:** Thin Event Handler (from event-handlers-vs-use-cases.md)
 * - Handler is just an adapter (5-10 lines)
 * - Use case contains all orchestration logic
 * - Use case can be called from multiple entry points (event, API, CLI, batch)
 *
 * @example
 * ```typescript
 * // Wire up at application startup
 * eventBus.subscribe('UserBirthdayChanged', async (event) => {
 *   await handler.handle(event);
 * });
 * ```
 */
export class RescheduleEventsOnUserBirthdayChangedHandler {
  public constructor(
    private readonly rescheduleBirthdayEventsUseCase: RescheduleBirthdayEventsUseCase
  ) {}

  /**
   * Handle UserBirthdayChanged event by delegating to use case
   *
   * @param event - UserBirthdayChanged domain event
   */
  public async handle(event: UserBirthdayChangedEvent): Promise<void> {
    try {
      // Adapt event payload to use case DTO
      await this.rescheduleBirthdayEventsUseCase.execute({
        userId: event.userId,
        newDateOfBirth: event.newDateOfBirth,
        timezone: event.timezone,
      });
    } catch (error) {
      // Log event context for debugging
      console.error('Failed to reschedule birthday events from UserBirthdayChanged event', {
        eventType: event.eventType,
        userId: event.userId,
        aggregateId: event.aggregateId,
        oldDateOfBirth: event.oldDateOfBirth,
        newDateOfBirth: event.newDateOfBirth,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Rethrow error to be handled by event bus error handling
      throw error;
    }
  }
}
