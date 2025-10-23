import { UserTimezoneChangedEvent } from '../../../user/domain/events/UserTimezoneChanged';
import { RescheduleEventsOnTimezoneChangeUseCase } from '../use-cases/RescheduleEventsOnTimezoneChangeUseCase';

/**
 * Event handler that reacts to UserTimezoneChanged domain events and reschedules events.
 *
 * This is a **thin adapter** that translates domain events into use case calls.
 * All orchestration logic lives in RescheduleEventsOnTimezoneChangeUseCase.
 *
 * **Architecture Pattern:** Thin Event Handler + Use Case
 * - Handler: Adapts domain event to DTO and delegates to use case
 * - Use Case: Contains all orchestration logic (reusable, testable)
 *
 * **Bounded Context:** Event Scheduling Context
 * **Layer:** Application (event adapter)
 *
 * This handler decouples User Context from Event Scheduling Context by using domain events.
 * When a user's timezone is updated, this handler triggers the RescheduleEventsOnTimezoneChangeUseCase
 * which recalculates UTC times for PENDING events while maintaining the same local time (9:00 AM).
 *
 * @see RescheduleEventsOnTimezoneChangeUseCase for business logic
 * @see docs/architecture/event-handlers-vs-use-cases.md for architecture rationale
 *
 * @example
 * ```typescript
 * // Wire up at application startup
 * eventBus.subscribe('UserTimezoneChanged', async (event) => {
 *   await handler.handle(event);
 * });
 * ```
 */
export class RescheduleEventsOnUserTimezoneChangedHandler {
  public constructor(
    private readonly rescheduleEventsOnTimezoneChangeUseCase: RescheduleEventsOnTimezoneChangeUseCase
  ) {}

  /**
   * Handle UserTimezoneChanged event by delegating to use case
   *
   * @param event - UserTimezoneChanged domain event
   */
  public async handle(event: UserTimezoneChangedEvent): Promise<void> {
    try {
      // Delegate to use case (thin adapter pattern)
      await this.rescheduleEventsOnTimezoneChangeUseCase.execute({
        userId: event.userId,
        newTimezone: event.newTimezone,
      });
    } catch (error) {
      // Log error with event context for debugging
      console.error('Failed to reschedule events from UserTimezoneChanged event', {
        eventType: event.eventType,
        userId: event.userId,
        aggregateId: event.aggregateId,
        oldTimezone: event.oldTimezone,
        newTimezone: event.newTimezone,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Rethrow error to be handled by event bus error handling
      throw error;
    }
  }
}
