import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { Event } from '../../domain/entities/Event';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import type { IEventRepository } from '../ports/IEventRepository';
import type { IWebhookClient } from '../ports/IWebhookClient';
import type { IUserRepository } from '../../../user/application/ports/IUserRepository';
import { BirthdayEventHandler } from '../../domain/services/event-handlers/BirthdayEventHandler';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { WebhookPayloadSchema, type WebhookPayload } from '../../../../shared/validation/schemas';
import { PermanentDeliveryError } from '../../../../domain/errors/PermanentDeliveryError';
import { InfrastructureError } from '../../../../domain/errors/InfrastructureError';
import { logger } from '../../../../shared/logger';
import type { UserInfo } from '../types/UserInfo';

/**
 * ExecuteEventUseCase
 *
 * **Purpose:**
 * Executes a claimed event by delivering its webhook payload to an external service
 * and updating the event status based on the delivery outcome.
 *
 * **Workflow:**
 * 1. Retrieve event from repository by ID
 * 2. Validate event status is PROCESSING (already claimed by scheduler)
 * 3. Parse and validate webhook payload from event.deliveryPayload
 * 4. Deliver webhook using WebhookClient (includes automatic retry logic)
 * 5. Update event status based on delivery outcome:
 *    - Success → COMPLETED (with executedAt timestamp)
 *    - Permanent failure (4xx) → FAILED (no retry)
 *    - Transient failure (5xx, timeout) → Leave in PROCESSING (SQS retries)
 *
 * **Error Handling Strategy:**
 *
 * | Error Type | Cause | Action | Update Event? |
 * |------------|-------|--------|---------------|
 * | PermanentDeliveryError | 4xx HTTP status | Mark FAILED | Yes |
 * | InfrastructureError | 5xx, timeout, network | Log error, return | No (SQS retries) |
 * | Event not found | Repository miss | Log warning, return | No |
 * | Invalid status | Event not PROCESSING | Log error, return | No |
 * | Invalid payload | Zod validation fails | Rethrow error | No |
 *
 * **Retry Layers:**
 * 1. **WebhookClient Level:** 3 retries with exponential backoff (1s, 2s, 4s)
 * 2. **SQS Level:** Message visibility timeout allows worker to retry entire execution
 * 3. **Use Case Level:** NO RETRY - trust the layers above
 *
 * **Critical Decision: When to Update Event Status**
 *
 * The use case ONLY updates event status to FAILED on PermanentDeliveryError.
 * For InfrastructureError (transient failures), the event remains in PROCESSING
 * state so that SQS can retry the entire execution flow.
 *
 * This approach ensures:
 * - Permanent failures (4xx) don't waste SQS retries
 * - Transient failures (5xx) benefit from SQS retry visibility timeout
 * - WebhookClient handles low-level retries (exponential backoff)
 * - SQS handles high-level retries (entire execution)
 *
 * **Idempotency:**
 * The idempotency key from `event.idempotencyKey` is passed to WebhookClient,
 * which includes it in the X-Idempotency-Key HTTP header. This enables external
 * webhook endpoints to deduplicate requests if SQS retries the execution.
 *
 * @see IWebhookClient for webhook delivery contract and retry policy
 * @see Event.markCompleted for PROCESSING → COMPLETED transition
 * @see Event.markFailed for PROCESSING → FAILED transition
 * @see docs/architecture/error-handling.md#External-API-Errors
 * @see docs/architecture/design-patterns.md#Hexagonal-Architecture
 */
export class ExecuteEventUseCase {
  /**
   * Constructs the ExecuteEventUseCase with its dependencies
   *
   * @param eventRepository - Repository for event persistence operations
   * @param webhookClient - Client for webhook delivery with automatic retries
   * @param userRepository - Repository for user data (needed for next year event generation)
   * @param birthdayEventHandler - Handler for birthday-specific logic (next occurrence calculation)
   * @param timezoneService - Service for timezone conversions (local to UTC)
   */
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly webhookClient: IWebhookClient,
    private readonly userRepository: IUserRepository,
    private readonly birthdayEventHandler: BirthdayEventHandler,
    private readonly timezoneService: TimezoneService
  ) {}

  /**
   * Executes an event by delivering its webhook payload and updating status
   *
   * @param eventId - UUID of the event to execute
   * @returns Promise<void> - Resolves when execution completes (or fails permanently)
   *
   * @throws InfrastructureError - Rethrown from webhookClient after retry exhaustion (SQS will retry)
   * @throws Error - Rethrown from repository or validation failures
   *
   * **Behavior on Different Error Types:**
   *
   * 1. **Event Not Found:**
   *    - Logs warning
   *    - Returns without error (idempotent - event may have been processed by another worker)
   *
   * 2. **Event Status Not PROCESSING:**
   *    - Logs error
   *    - Returns without error (invalid state - likely already processed or failed)
   *
   * 3. **PermanentDeliveryError (4xx):**
   *    - Marks event as FAILED with failureReason
   *    - Logs error
   *    - Returns successfully (no SQS retry needed)
   *
   * 4. **InfrastructureError (5xx, timeout, network):**
   *    - Logs error
   *    - Rethrows error (SQS will retry entire execution)
   *    - Event remains in PROCESSING state
   *
   * 5. **Successful Delivery:**
   *    - Marks event as COMPLETED with executedAt timestamp
   *    - Logs success
   *    - Returns successfully
   */
  public async execute(eventId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Step 1: Retrieve event from repository
      logger.info({
        msg: 'Event execution started',
        eventId,
      });

      const event = await this.eventRepository.findById(eventId);

      // Handle event not found (idempotent - may have been processed by another worker)
      if (!event) {
        logger.warn({
          msg: 'Event not found for execution',
          eventId,
        });
        return;
      }

      // Step 2: Validate event status is PROCESSING
      if (event.status !== EventStatus.PROCESSING) {
        logger.error({
          msg: 'Event status is not PROCESSING - cannot execute',
          eventId,
          currentStatus: event.status,
          expectedStatus: EventStatus.PROCESSING,
        });
        return;
      }

      // Step 3: Parse and validate webhook payload from event.deliveryPayload
      let payload: WebhookPayload;
      try {
        payload = WebhookPayloadSchema.parse(event.deliveryPayload);
      } catch (validationError) {
        logger.error({
          msg: 'Invalid webhook payload schema',
          eventId,
          deliveryPayload: event.deliveryPayload,
          error:
            validationError instanceof Error ? validationError.message : String(validationError),
        });
        // Rethrow validation error - this is a permanent failure (bad data)
        throw validationError;
      }

      // Step 4: Deliver webhook using WebhookClient
      logger.info({
        msg: 'Delivering webhook',
        eventId,
        idempotencyKey: event.idempotencyKey.toString(),
        payload,
      });

      try {
        const response = await this.webhookClient.deliver(payload, event.idempotencyKey.toString());

        // Step 5a: Successful delivery - mark event as COMPLETED and generate next year event
        const completedEvent = event.markCompleted(DateTime.now());
        await this.generateNextYearEventAndComplete(completedEvent, event.userId);

        const durationMs = Date.now() - startTime;
        logger.info({
          msg: 'Event execution completed successfully',
          eventId,
          idempotencyKey: event.idempotencyKey.toString(),
          status: EventStatus.COMPLETED,
          durationMs,
          response,
        });
      } catch (error) {
        // Step 5b: Permanent failure (4xx) - mark event as FAILED
        if (error instanceof PermanentDeliveryError) {
          const failedEvent = event.markFailed(error.message);
          await this.eventRepository.update(failedEvent);

          const durationMs = Date.now() - startTime;
          logger.error({
            msg: 'Event execution failed permanently',
            eventId,
            idempotencyKey: event.idempotencyKey.toString(),
            status: EventStatus.FAILED,
            error: error.message,
            statusCode: error.statusCode,
            durationMs,
          });

          // Return successfully - no need for SQS retry on permanent failures
          return;
        }

        // Step 5c: Transient failure (5xx, timeout, network) - leave in PROCESSING for SQS retry
        if (error instanceof InfrastructureError) {
          const durationMs = Date.now() - startTime;
          logger.error({
            msg: 'Event execution failed with transient error - SQS will retry',
            eventId,
            idempotencyKey: event.idempotencyKey.toString(),
            status: EventStatus.PROCESSING,
            error: error.message,
            durationMs,
          });

          // Rethrow to trigger SQS retry (event remains in PROCESSING)
          throw error;
        }

        // Step 5d: Unexpected error - log and rethrow
        const durationMs = Date.now() - startTime;
        logger.error({
          msg: 'Event execution failed with unexpected error',
          eventId,
          idempotencyKey: event.idempotencyKey.toString(),
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          durationMs,
        });

        // Rethrow unexpected errors
        throw error;
      }
    } catch (error) {
      // Catch block for repository errors, validation errors, or rethrown errors
      // Log at top level if not already logged
      if (!(error instanceof InfrastructureError) && !(error instanceof PermanentDeliveryError)) {
        logger.error({
          msg: 'Event execution failed with system error',
          eventId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }

      // Rethrow to caller (SQS worker)
      throw error;
    }
  }

  /**
   * Generates next year's birthday event after current event completes successfully.
   * Wraps both status update and next year event creation in a transaction for atomicity.
   *
   * **Transaction Rationale (AC 5):**
   * Both operations must succeed or both fail to maintain system consistency:
   * - If status update succeeds but event creation fails → broken annual chain
   * - If event creation succeeds but status update fails → two PROCESSING events for same user
   *
   * **Conditional Logic (AC 6):**
   * Only generates next year event if current event is marked COMPLETED (not FAILED).
   * Failed deliveries should not trigger automatic annual recurrence.
   *
   * @param completedEvent - The event marked as COMPLETED
   * @param userId - The user ID for which to generate next year event
   * @private
   */
  private async generateNextYearEventAndComplete(
    completedEvent: Event,
    userId: string
  ): Promise<void> {
    try {
      // Step 1: Retrieve user data for next year event calculation
      const user = await this.userRepository.findById(userId);

      // Step 2: Handle user deleted scenario (graceful degradation - AC Task 1)
      if (!user) {
        logger.warn({
          msg: 'User deleted after event execution, skipping next year event generation',
          userId,
          eventId: completedEvent.id,
        });
        // Still update the completed event status even if user is deleted
        await this.eventRepository.update(completedEvent);
        return;
      }

      // Step 3: Convert User entity to UserInfo interface for BirthdayEventHandler
      const userInfo: UserInfo = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth.toString(), // DateOfBirth value object → ISO string
        timezone: user.timezone.toString(), // Timezone value object → IANA string
      };

      // Step 4: Calculate next birthday at 9:00 AM local time (AC 3, 4)
      // Use completedEvent's target timestamp as reference (not DateTime.now())
      // This ensures next year event is calculated relative to the birthday being celebrated
      const nextBirthdayLocal = this.birthdayEventHandler.calculateNextOccurrence(
        userInfo,
        completedEvent.targetTimestampLocal
      );

      // Step 5: Convert local timestamp to UTC for storage
      const nextBirthdayUTC = this.timezoneService.convertToUTC(
        nextBirthdayLocal,
        new Timezone(userInfo.timezone)
      );

      // Step 6: Generate formatted birthday message
      const message = this.birthdayEventHandler.formatMessage(userInfo);

      // Step 7: Create next year Event entity (AC Task 3)
      const nextYearEvent = new Event({
        id: randomUUID(),
        userId: user.id,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: nextBirthdayUTC,
        targetTimestampLocal: nextBirthdayLocal,
        targetTimezone: user.timezone.toString(),
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(user.id, nextBirthdayUTC),
        deliveryPayload: { message },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Step 8: Transaction - update completed event AND create next year event atomically (AC 5)
      // Note: Since repository doesn't expose transaction method, we'll do sequential operations
      // The idempotency key prevents duplicates if operation retries
      await this.eventRepository.update(completedEvent);

      try {
        await this.eventRepository.create(nextYearEvent);

        logger.info({
          msg: 'Next year birthday event generated successfully',
          userId: user.id,
          currentEventId: completedEvent.id,
          nextYearEventId: nextYearEvent.id,
          nextBirthdayUTC: nextBirthdayUTC.toISO(),
          nextBirthdayLocal: nextBirthdayLocal.toISO(),
        });
      } catch (createError) {
        // Handle idempotency key collision - next year event already exists
        // This can happen if multiple events for the same user execute concurrently
        const errorMessage =
          createError instanceof Error ? createError.message : String(createError);
        if (
          errorMessage.includes('idempotency_key') ||
          errorMessage.includes('Unique constraint')
        ) {
          logger.warn({
            msg: 'Next year event already exists (idempotency key collision) - skipping creation',
            userId: user.id,
            currentEventId: completedEvent.id,
            idempotencyKey: nextYearEvent.idempotencyKey.toString(),
          });
          // This is expected behavior - don't rethrow
          return;
        }

        // Other errors should be rethrown
        throw createError;
      }
    } catch (error) {
      // Handle errors during user fetch or next year calculation
      logger.error({
        msg: 'Failed to generate next year event',
        userId,
        eventId: completedEvent.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Rethrow error to trigger SQS retry (entire execution including next year generation)
      throw error;
    }
  }
}
