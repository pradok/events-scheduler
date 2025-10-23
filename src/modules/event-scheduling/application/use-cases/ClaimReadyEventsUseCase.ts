import { IEventRepository } from '../ports/IEventRepository';
import { Event } from '../../domain/entities/Event';
import { logger } from '../../../../shared/logger';

/**
 * Use case that polls for ready events and claims them atomically.
 *
 * This use case is invoked every minute by EventBridge (Story 2.3).
 * It queries the database for events that are ready to execute
 * (targetTimestampUTC <= now) and atomically claims them by updating
 * their status to PROCESSING.
 *
 * The atomic claiming logic is implemented in PrismaEventRepository
 * using PostgreSQL FOR UPDATE SKIP LOCKED to prevent race conditions
 * when multiple scheduler instances run concurrently.
 *
 * @see docs/architecture/design-patterns.md - Distributed Scheduler Pattern
 * @see docs/stories/2.1.event-scheduler-polling-query.story.md
 */
export class ClaimReadyEventsUseCase {
  public constructor(private readonly eventRepository: IEventRepository) {}

  /**
   * Claims ready events from the database atomically.
   *
   * This method:
   * 1. Queries for events where targetTimestampUTC <= now AND status = PENDING
   * 2. Atomically locks and updates them to PROCESSING status
   * 3. Returns the claimed events for further processing
   *
   * The limit of 100 events prevents overwhelming the system during recovery
   * from downtime when many backlogged events may exist.
   *
   * @returns Array of claimed Event entities (status = PROCESSING)
   * @throws Re-throws any errors from the repository layer for Lambda retry handling
   */
  public async execute(): Promise<Event[]> {
    const startTime = Date.now();

    logger.info('ClaimReadyEvents execution started');

    try {
      // Claim up to 100 ready events atomically
      const claimedEvents = await this.eventRepository.claimReadyEvents(100);

      const duration = Date.now() - startTime;

      logger.info({
        msg: 'ClaimReadyEvents execution completed',
        eventsClaimed: claimedEvents.length,
        durationMs: duration,
      });

      return claimedEvents;
    } catch (error) {
      logger.error({
        msg: 'ClaimReadyEvents execution failed',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Rethrow error - let Lambda handler decide retry strategy
      throw error;
    }
  }
}
