import { logger } from '../shared/logger';
import { RecoveryService } from '../modules/event-scheduling/domain/services/RecoveryService';
import { PrismaEventRepository } from '../modules/event-scheduling/adapters/persistence/PrismaEventRepository';
import { SQSAdapter } from '../adapters/secondary/messaging/SQSAdapter';
import { PrismaClient } from '@prisma/client';
import { SQSClient } from '@aws-sdk/client-sqs';

/**
 * Startup Recovery Hook
 *
 * **Purpose:**
 * Automatically run recovery check when the system starts to detect and queue
 * missed events that should have executed during downtime.
 *
 * **When This Runs:**
 * - On application startup (src/index.ts)
 * - On Lambda cold start (src/adapters/primary/lambda/schedulerHandler.ts)
 * - On Docker Compose container restart
 *
 * **Error Handling:**
 * - NEVER throws - allows system to continue starting even if recovery fails
 * - Logs errors for operator investigation
 * - Operator can manually trigger recovery if needed
 *
 * **Logging:**
 * - "Running recovery check..." - Start
 * - "No missed events found" - No work needed (eventsQueued === 0)
 * - "Recovery check complete" - Work completed (eventsQueued > 0)
 * - "Recovery check failed" - Error occurred (system still starts)
 *
 * @see Story 3.3: Recovery on System Startup (Simplified)
 * @see RecoveryService for recovery logic
 */
export async function runRecoveryOnStartup(): Promise<void> {
  logger.info('Running recovery check...');

  try {
    // Initialize dependencies
    const prisma = new PrismaClient();
    const eventRepository = new PrismaEventRepository(prisma);

    const sqsClient = new SQSClient({
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const sqsAdapter = new SQSAdapter(sqsClient, process.env.SQS_QUEUE_URL!);

    // Run recovery
    const recoveryService = new RecoveryService(eventRepository, sqsAdapter, logger);

    const result = await recoveryService.execute();

    // Log result
    if (result.eventsQueued === 0) {
      logger.info('No missed events found');
    } else {
      logger.info({
        msg: 'Recovery check complete',
        eventsQueued: result.eventsQueued,
        eventsFailed: result.eventsFailed,
      });
    }
  } catch (error) {
    logger.error({
      msg: 'Recovery check failed',
      error: error instanceof Error ? error.message : String(error),
    });
    // Do NOT throw - allow system to continue starting
  }
}
