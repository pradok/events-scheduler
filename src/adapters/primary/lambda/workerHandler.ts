import { PrismaClient } from '@prisma/client';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { PrismaEventRepository } from '../../../modules/event-scheduling/adapters/persistence/PrismaEventRepository';
import { WebhookAdapter } from '../../secondary/delivery/WebhookAdapter';
import { ExecuteEventUseCase } from '../../../modules/event-scheduling/application/use-cases/ExecuteEventUseCase';
import {
  SQSMessagePayloadSchema,
  type SQSMessagePayload,
} from '../../../shared/validation/schemas';
import { ValidationError } from '../../../domain/errors/ValidationError';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError';
import { logger } from '../../../shared/logger';

// Singleton Prisma client (reused across Lambda warm starts)
let prismaClient: PrismaClient | null = null;

/**
 * Gets or creates the Prisma client singleton.
 *
 * Lambda containers are reused across invocations ("warm starts").
 * This singleton pattern ensures we reuse the database connection
 * pool instead of creating new connections on every invocation.
 *
 * @returns Singleton PrismaClient instance
 */
function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

/**
 * Worker Lambda handler invoked by SQS queue messages.
 *
 * This handler orchestrates the event execution workflow:
 * 1. Receives batch of SQS messages (up to 10 messages per invocation)
 * 2. Validates each message payload against SQSMessagePayloadSchema
 * 3. Executes event using ExecuteEventUseCase
 * 4. Handles errors to determine retry strategy:
 *    - Permanent failures (4xx) → message deleted (no retry)
 *    - Transient failures (5xx, network) → message retained (SQS retries)
 *    - Invalid payloads → message sent to DLQ
 *
 * **Architecture:**
 * - Primary Adapter (Hexagonal Architecture): Inbound/driving adapter
 * - Dependency Injection: Wires up repositories, adapters, and use cases
 * - Error Handling: Controls message deletion via throw/return
 *
 * **SQS Trigger Configuration:**
 * - Queue: `events-queue`
 * - Batch size: 10 messages
 * - Visibility timeout: 60 seconds
 * - Dead Letter Queue: `events-dlq`
 * - Max receive count: 3 (after 3 failed attempts → DLQ)
 *
 * **Message Deletion Behavior:**
 * - Handler returns normally → Lambda deletes message from queue
 * - Handler throws error → Lambda does NOT delete message (reappears after visibility timeout)
 *
 * **Performance:**
 * - Cold start: ~2-3 seconds (includes Prisma initialization)
 * - Warm start: ~500ms (reuses Prisma connection pool)
 * - Processing time per message: ~100-500ms (depends on webhook response time)
 *
 * @param event - SQS event containing batch of messages
 * @returns Promise<void> - Resolves if all messages processed successfully or had permanent failures
 *
 * @throws Error - If any message has transient failure (triggers SQS retry for that message)
 *
 * @see ExecuteEventUseCase for event execution logic
 * @see WebhookAdapter for webhook delivery logic
 * @see docs/stories/2.6.worker-lambda-sqs-consumer.story.md
 * @see docs/architecture/design-patterns.md#Hexagonal-Architecture
 */
export async function handler(event: SQSEvent): Promise<void> {
  logger.info({
    msg: 'Worker Lambda execution started',
    messageCount: event.Records.length,
  });

  // Dependency injection: Create repositories, adapters, and use cases
  const prisma = getPrismaClient();
  const eventRepository = new PrismaEventRepository(prisma);
  const webhookClient = new WebhookAdapter(process.env.WEBHOOK_TEST_URL!);
  const executeEventUseCase = new ExecuteEventUseCase(eventRepository, webhookClient);

  // Process each SQS record independently
  for (const record of event.Records) {
    await processRecord(record, executeEventUseCase);
  }

  logger.info({
    msg: 'Worker Lambda execution completed',
    messagesProcessed: event.Records.length,
  });
}

/**
 * Processes a single SQS record by validating payload and executing event.
 *
 * **Error Handling Strategy:**
 *
 * | Error Type | Action | Message Deleted? | Event Status |
 * |------------|--------|------------------|--------------|
 * | ValidationError | Throw → DLQ | No (sent to DLQ) | N/A |
 * | Event not found | Return | Yes | N/A |
 * | PermanentDeliveryError | Return | Yes | FAILED |
 * | InfrastructureError | Throw → Retry | No (reappears) | PROCESSING |
 * | Unexpected error | Throw → Retry | No (reappears) | PROCESSING |
 *
 * @param record - SQS record to process
 * @param executeEventUseCase - Use case for executing events
 *
 * @throws ValidationError - Invalid message payload (sent to DLQ)
 * @throws InfrastructureError - Transient failure (SQS retry)
 * @throws Error - Unexpected error (SQS retry as safety mechanism)
 *
 * @see SQSMessagePayloadSchema for message validation rules
 * @see ExecuteEventUseCase for event execution logic
 */
async function processRecord(
  record: SQSRecord,
  executeEventUseCase: ExecuteEventUseCase
): Promise<void> {
  const startTime = Date.now();
  const messageId = record.messageId;

  logger.info({
    msg: 'Processing SQS message',
    messageId,
  });

  // Step 1: Parse and validate message payload
  let payload: SQSMessagePayload;
  try {
    const parsed: unknown = JSON.parse(record.body);
    const validationResult = SQSMessagePayloadSchema.safeParse(parsed);

    if (!validationResult.success) {
      logger.error({
        msg: 'Invalid SQS message payload - sending to DLQ',
        messageId,
        validationErrors: validationResult.error.issues,
        rawBody: record.body,
      });

      // Throw ValidationError to send message to DLQ (cannot be retried)
      throw new ValidationError(
        `Invalid SQS message payload: ${validationResult.error.message}`,
        validationResult.error.issues
      );
    }

    payload = validationResult.data;
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      throw error; // Rethrow validation error to send to DLQ
    }

    // JSON parsing failed
    logger.error({
      msg: 'Failed to parse SQS message body as JSON - sending to DLQ',
      messageId,
      error: error instanceof Error ? error.message : String(error),
      rawBody: record.body,
    });

    throw new ValidationError('Failed to parse SQS message body as JSON');
  }

  // Step 2: Execute event using ExecuteEventUseCase
  const { eventId, idempotencyKey } = payload;

  logger.info({
    msg: 'Executing event from SQS message',
    messageId,
    eventId,
    idempotencyKey,
  });

  try {
    await executeEventUseCase.execute(eventId);

    // Success - message will be deleted automatically
    const durationMs = Date.now() - startTime;
    logger.info({
      msg: 'SQS message processed successfully',
      messageId,
      eventId,
      idempotencyKey,
      durationMs,
    });
  } catch (error: unknown) {
    // Step 3: Handle execution errors
    if (error instanceof InfrastructureError) {
      // Transient failure - rethrow to trigger SQS retry
      const durationMs = Date.now() - startTime;
      logger.error({
        msg: 'Transient failure executing event - message will retry',
        messageId,
        eventId,
        idempotencyKey,
        error: error.message,
        durationMs,
      });

      throw error; // Rethrow to prevent message deletion
    }

    // Unexpected error - rethrow to be safe (triggers SQS retry)
    const durationMs = Date.now() - startTime;
    logger.error({
      msg: 'Unexpected error executing event - message will retry',
      messageId,
      eventId,
      idempotencyKey,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });

    throw error; // Rethrow to prevent message deletion
  }
}
