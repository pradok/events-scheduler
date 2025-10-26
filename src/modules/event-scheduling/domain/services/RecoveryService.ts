import type { IEventRepository } from '../../application/ports/IEventRepository';
import type { ISQSClient } from '../../application/ports/ISQSClient';
import type { Event } from '../entities/Event';
import type { SQSMessagePayload } from '../../../../shared/validation/schemas';
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
 * statistics about detected missed events and SQS queueing results.
 *
 * @see Story 3.2: Recovery Execution (Simplified)
 */
export interface RecoveryResult {
  /**
   * Total number of missed events detected in this recovery batch
   */
  missedEventsCount: number;

  /**
   * Number of events successfully queued to SQS for execution
   * Should equal missedEventsCount if all events were queued successfully
   */
  eventsQueued: number;

  /**
   * Number of events that failed to send to SQS
   * Non-zero value indicates partial recovery failure requiring investigation
   */
  eventsFailed: number;

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
 * Detects missed events that should have executed during system downtime
 * and queues them to SQS for execution by worker Lambdas.
 *
 * **Query Logic:**
 * Finds events where:
 * - `status = 'PENDING'` (not yet executed)
 * - `targetTimestampUTC < NOW()` (should have already fired)
 * - Ordered by `targetTimestampUTC ASC` (oldest first - fair recovery)
 * - Limited to 1000 events per batch (prevent memory overflow)
 *
 * **Recovery Flow (Story 3.2):**
 * 1. Detect missed events via IEventRepository.findMissedEvents()
 * 2. Send each event to SQS queue via ISQSClient.sendMessage()
 * 3. Continue processing on error (don't fail entire batch)
 * 4. Log completion with eventsQueued and eventsFailed counts
 *
 * **Error Handling:**
 * - Continue processing remaining events if one fails to send to SQS
 * - Track failed count separately from successful count
 * - Log each failure with event ID and error details
 * - Better to recover 99/100 events than fail entire batch
 *
 * **Simplified MVP Approach:**
 * - ✅ Send to SQS (existing worker processes normally)
 * - ✅ Log recovery completion
 * - ❌ No lateExecution flag (deferred to Epic 4)
 * - ❌ No lateness metrics (deferred to Epic 4)
 * - ❌ No batch SQS optimization (deferred)
 *
 * @see Story 3.1: Recovery Service - Missed Event Detection
 * @see Story 3.2: Recovery Execution (Simplified)
 * @see docs/architecture/port-interfaces.md#ISQSClient
 * @see docs/architecture/coding-standards.md#1-no-consolelog-in-production
 */
export class RecoveryService {
  /**
   * Constructs the RecoveryService with its dependencies
   *
   * @param eventRepository - Repository for querying missed events
   * @param sqsClient - SQS client for queueing events for execution
   * @param logger - Pino logger for structured logging
   */
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly sqsClient: ISQSClient,
    private readonly logger: ILogger
  ) {}

  /**
   * Detects missed events and queues them to SQS for execution
   *
   * This method queries the database for PENDING events with
   * targetTimestampUTC in the past, sends them to SQS queue,
   * and returns statistics about the recovery operation.
   *
   * **Workflow:**
   * 1. Query repository for missed events (up to 1000)
   * 2. If no events found, log and return early
   * 3. Send each event to SQS (continue on error)
   * 4. Calculate oldest/newest timestamps
   * 5. Log completion with eventsQueued and eventsFailed counts
   * 6. Return RecoveryResult with statistics
   *
   * **Example Log Output (no events):**
   * ```json
   * {
   *   "level": "info",
   *   "msg": "No missed events found"
   * }
   * ```
   *
   * **Example Log Output (events found and queued):**
   * ```json
   * {
   *   "level": "info",
   *   "msg": "Recovery complete",
   *   "eventsQueued": 42,
   *   "eventsFailed": 0
   * }
   * ```
   *
   * **Example Log Output (partial failure):**
   * ```json
   * {
   *   "level": "error",
   *   "msg": "Failed to queue event for recovery",
   *   "eventId": "event-123",
   *   "error": "Network timeout"
   * }
   * {
   *   "level": "info",
   *   "msg": "Recovery complete",
   *   "eventsQueued": 41,
   *   "eventsFailed": 1
   * }
   * ```
   *
   * @returns Promise<RecoveryResult> - Statistics about recovery operation
   *
   * @see IEventRepository.findMissedEvents for query details
   * @see ISQSClient.sendMessage for SQS queueing
   * @see Story 3.2 AC 1, 2, 3
   */
  public async execute(): Promise<RecoveryResult> {
    // Step 1: Query for missed events (up to batch limit)
    const missedEvents = await this.findMissedEvents();

    // Step 2: Handle no missed events case
    if (missedEvents.length === 0) {
      this.logger.info('No missed events found');

      return {
        missedEventsCount: 0,
        eventsQueued: 0,
        eventsFailed: 0,
        oldestEventTimestamp: null,
        newestEventTimestamp: null,
      };
    }

    // Step 3: Send each event to SQS (continue processing on error)
    let queuedCount = 0;
    let failedCount = 0;

    for (const event of missedEvents) {
      try {
        // Create SQS message payload
        const payload: SQSMessagePayload = {
          eventId: event.id,
          eventType: event.eventType,
          idempotencyKey: event.idempotencyKey.toString(),
          metadata: {
            userId: event.userId,
            targetTimestampUTC: event.targetTimestampUTC.toISO() || '',
            deliveryPayload: event.deliveryPayload,
          },
        };

        // Send to SQS
        await this.sqsClient.sendMessage(payload);
        queuedCount++;
      } catch (error) {
        // Log error but continue processing remaining events
        this.logger.error({
          msg: 'Failed to queue event for recovery',
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
        failedCount++;
      }
    }

    // Step 4: Calculate oldest and newest timestamps
    // Events are sorted ASC, so first element is oldest, last is newest
    const oldestEventTimestamp = missedEvents[0]!.targetTimestampUTC;
    const newestEventTimestamp = missedEvents[missedEvents.length - 1]!.targetTimestampUTC;

    // Step 5: Log completion with statistics
    this.logger.info({
      msg: 'Recovery complete',
      eventsQueued: queuedCount,
      eventsFailed: failedCount,
    });

    // Step 6: Return recovery result
    return {
      missedEventsCount: missedEvents.length,
      eventsQueued: queuedCount,
      eventsFailed: failedCount,
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
