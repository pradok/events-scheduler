import type { IEventRepository } from '../../application/ports/IEventRepository';
import type { Event } from '../entities/Event';
import { DateTime } from 'luxon';

/**
 * Maximum number of missed events to retrieve per recovery batch.
 * Prevents memory overflow during recovery from extended downtime.
 *
 * @see Story 3.1 AC 4
 */
const MAX_RECOVERY_BATCH_SIZE = 1000;

/**
 * RecoveryResult
 *
 * Result object returned by RecoveryService.execute() containing
 * statistics about detected missed events.
 */
export interface RecoveryResult {
  /**
   * Total number of missed events detected in this recovery batch
   */
  missedEventsCount: number;

  /**
   * Timestamp of the oldest missed event (null if no events found)
   * Indicates how far back the system needs to recover
   */
  oldestEventTimestamp: DateTime | null;

  /**
   * Timestamp of the newest missed event (null if no events found)
   * Indicates the most recent event that was missed
   */
  newestEventTimestamp: DateTime | null;
}

/**
 * Logger interface for dependency injection
 * Matches Pino logger structure
 */
export interface ILogger {
  info(msg: string): void;
  info(obj: Record<string, unknown>): void;
  warn(msg: string): void;
  warn(obj: Record<string, unknown>): void;
  error(msg: string): void;
  error(obj: Record<string, unknown>): void;
  debug(msg: string): void;
  debug(obj: Record<string, unknown>): void;
}

/**
 * RecoveryService
 *
 * **Purpose:**
 * Detects missed events that should have executed during system downtime.
 * This service is invoked on system startup to identify backlogged events
 * that need to be processed.
 *
 * **Query Logic:**
 * Finds events where:
 * - `status = 'PENDING'` (not yet executed)
 * - `targetTimestampUTC < NOW()` (should have already fired)
 * - Ordered by `targetTimestampUTC ASC` (oldest first - fair recovery)
 * - Limited to 1000 events per batch (prevent memory overflow)
 *
 * **Why separate from ClaimReadyEventsUseCase?**
 * - Recovery service only DETECTS missed events
 * - ClaimReadyEventsUseCase actually CLAIMS and PROCESSES events
 * - Separation of concerns: detection ≠ execution
 * - Story 3.2 will handle batch processing via SQS
 *
 * **Logging:**
 * Uses Pino structured logging to report:
 * - Total count of missed events
 * - Timestamp of oldest missed event (how far behind system is)
 * - Timestamp of newest missed event (most recent backlog)
 *
 * @see Story 3.1: Recovery Service - Missed Event Detection
 * @see docs/architecture/port-interfaces.md#IEventRepository
 * @see docs/architecture/coding-standards.md#1-no-consolelog-in-production
 */
export class RecoveryService {
  /**
   * Constructs the RecoveryService with its dependencies
   *
   * @param eventRepository - Repository for querying missed events
   * @param logger - Pino logger for structured logging
   */
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly logger: ILogger
  ) {}

  /**
   * Detects missed events that should have executed during downtime
   *
   * This method queries the database for PENDING events with
   * targetTimestampUTC in the past and returns statistics about
   * the missed events.
   *
   * **Workflow:**
   * 1. Query repository for missed events (up to 1000)
   * 2. If no events found, log and return early
   * 3. If events found, calculate oldest/newest timestamps
   * 4. Log structured data about missed events
   * 5. Return RecoveryResult with statistics
   *
   * **Example Log Output (no events):**
   * ```json
   * {
   *   "level": "info",
   *   "msg": "No missed events found"
   * }
   * ```
   *
   * **Example Log Output (events found):**
   * ```json
   * {
   *   "level": "info",
   *   "msg": "Missed events found",
   *   "count": 42,
   *   "oldestEventTimestamp": "2025-10-19T14:00:00.000Z",
   *   "newestEventTimestamp": "2025-10-26T09:00:00.000Z"
   * }
   * ```
   *
   * @returns Promise<RecoveryResult> - Statistics about detected missed events
   *
   * @see IEventRepository.findMissedEvents for query details
   * @see Story 3.1 AC 5, 6
   */
  public async execute(): Promise<RecoveryResult> {
    // Step 1: Query for missed events (up to batch limit)
    const missedEvents = await this.findMissedEvents();

    // Step 2: Handle no missed events case
    if (missedEvents.length === 0) {
      this.logger.info('No missed events found');

      return {
        missedEventsCount: 0,
        oldestEventTimestamp: null,
        newestEventTimestamp: null,
      };
    }

    // Step 3: Calculate oldest and newest timestamps
    // Events are sorted ASC, so first element is oldest, last is newest
    const oldestEventTimestamp = missedEvents[0]!.targetTimestampUTC;
    const newestEventTimestamp = missedEvents[missedEvents.length - 1]!.targetTimestampUTC;

    // Step 4: Log structured data about missed events
    this.logger.info({
      msg: 'Missed events found',
      count: missedEvents.length,
      oldestEventTimestamp: oldestEventTimestamp.toISO(),
      newestEventTimestamp: newestEventTimestamp.toISO(),
    });

    // Step 5: Return recovery result
    return {
      missedEventsCount: missedEvents.length,
      oldestEventTimestamp,
      newestEventTimestamp,
    };
  }

  /**
   * Queries repository for missed events (private helper method)
   *
   * Delegates to IEventRepository.findMissedEvents() which returns
   * events where:
   * - `status = 'PENDING'`
   * - `targetTimestampUTC < NOW()`
   * - Ordered by `targetTimestampUTC ASC`
   * - Limited to MAX_RECOVERY_BATCH_SIZE (1000)
   *
   * @returns Promise<Event[]> - Array of missed Event entities (may be empty)
   * @private
   */
  private async findMissedEvents(): Promise<Event[]> {
    return this.eventRepository.findMissedEvents(MAX_RECOVERY_BATCH_SIZE);
  }
}
