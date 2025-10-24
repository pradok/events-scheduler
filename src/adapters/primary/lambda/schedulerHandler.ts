import { PrismaClient } from '@prisma/client';
import { SQSClient } from '@aws-sdk/client-sqs';
import { PrismaEventRepository } from '../../../modules/event-scheduling/adapters/persistence/PrismaEventRepository';
import { ClaimReadyEventsUseCase } from '../../../modules/event-scheduling/application/use-cases/ClaimReadyEventsUseCase';
import { SQSAdapter } from '../../secondary/messaging/SQSAdapter';
import { logger } from '../../../shared/logger';
import type { SQSMessagePayload } from '../../../shared/validation/schemas';

/**
 * AWS EventBridge scheduled event payload structure.
 *
 * EventBridge sends this payload when triggered by a cron rule.
 * This structure matches the AWS EventBridge Scheduled Event format.
 *
 * @see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-run-lambda-schedule.html
 */
interface ScheduledEvent {
  version: string; // "0"
  id: string; // Unique event ID
  'detail-type': string; // "Scheduled Event"
  source: string; // "aws.events"
  account: string; // AWS account ID
  time: string; // ISO 8601 timestamp
  region: string; // "us-east-1"
  resources: string[]; // [EventBridge rule ARN]
  detail: Record<string, unknown>; // Empty object for scheduled events
}

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
 * Scheduler Lambda handler invoked by EventBridge every minute.
 *
 * This handler orchestrates the event scheduling workflow:
 * 1. Claims ready events from the database (status PENDING, targetTimestampUTC <= now)
 * 2. Sends each claimed event to SQS queue for asynchronous execution
 * 3. Logs metrics (events claimed, events sent to queue, duration)
 * 4. Handles errors gracefully (logs and continues, doesn't crash)
 *
 * **Architecture:**
 * - Primary Adapter (Hexagonal Architecture): Inbound/driving adapter
 * - Dependency Injection: Wires up repositories, adapters, and use cases
 * - Error Handling: Catches all errors to prevent Lambda crash (EventBridge doesn't retry)
 *
 * **EventBridge Trigger:**
 * - Rule: `event-scheduler-rule` (rate: 1 minute)
 * - Target: This Lambda function
 * - Payload: ScheduledEvent (contains rule ARN and timestamp)
 *
 * **Performance:**
 * - Cold start: ~2-3 seconds (includes Prisma initialization)
 * - Warm start: ~500ms (reuses Prisma connection pool)
 * - Batch size: Up to 100 events per invocation (configurable in ClaimReadyEventsUseCase)
 *
 * @param event - EventBridge scheduled event payload
 * @returns Promise<void> - Always completes successfully (errors logged, not thrown)
 *
 * @see ClaimReadyEventsUseCase for atomic event claiming logic
 * @see SQSAdapter for SQS message sending logic
 * @see docs/stories/2.3.eventbridge-scheduler-trigger.story.md
 * @see docs/architecture/design-patterns.md#Distributed-Scheduler-Pattern
 */
export async function handler(event: ScheduledEvent): Promise<void> {
  const startTime = Date.now();

  logger.info({
    msg: 'Scheduler Lambda execution started',
    eventBridgeRuleName: event.resources[0],
    eventTime: event.time,
  });

  try {
    // Dependency injection: Create repositories, adapters, and use cases
    const prisma = getPrismaClient();
    const eventRepository = new PrismaEventRepository(prisma);
    const claimReadyEventsUseCase = new ClaimReadyEventsUseCase(eventRepository);

    const sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL, // LocalStack or AWS
      credentials: process.env.AWS_ENDPOINT_URL // LocalStack requires dummy credentials
        ? { accessKeyId: 'test', secretAccessKey: 'test' }
        : undefined, // AWS uses default credential chain
    });
    const sqsAdapter = new SQSAdapter(sqsClient, process.env.SQS_QUEUE_URL!);

    // Claim ready events from database (atomic operation using FOR UPDATE SKIP LOCKED)
    const claimedEvents = await claimReadyEventsUseCase.execute();

    // Send claimed events to SQS queue for asynchronous execution
    let sentCount = 0;
    for (const claimedEvent of claimedEvents) {
      const payload: SQSMessagePayload = {
        eventId: claimedEvent.id,
        eventType: claimedEvent.eventType,
        idempotencyKey: claimedEvent.idempotencyKey.toString(),
        metadata: {
          userId: claimedEvent.userId,
          targetTimestampUTC: claimedEvent.targetTimestampUTC.toISO()!,
          deliveryPayload: claimedEvent.deliveryPayload,
        },
      };

      await sqsAdapter.sendMessage(payload);
      sentCount++;
    }

    const duration = Date.now() - startTime;

    logger.info({
      msg: 'Scheduler Lambda execution completed',
      eventsClaimed: claimedEvents.length,
      eventsSentToQueue: sentCount,
      durationMs: duration,
    });
  } catch (error) {
    logger.error({
      msg: 'Scheduler Lambda execution failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      eventBridgeRuleName: event.resources[0],
    });

    // DO NOT rethrow - EventBridge doesn't have built-in retry logic
    // Next scheduled execution (in 1 minute) will catch any missed events
    // The scheduler is idempotent - events stay PENDING if not claimed
  }
}
