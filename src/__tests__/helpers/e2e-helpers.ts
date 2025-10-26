/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E2E test helpers use looser type safety for flexibility with external APIs.
 * Strict type checking is enforced in src/ files, not in test helpers.
 */

import { PrismaClient } from '@prisma/client';
import { SQSClient, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';

/**
 * Reusable E2E Test Helpers
 *
 * This module provides utility functions for E2E tests to reduce boilerplate
 * and improve test readability.
 *
 * **Usage:**
 * ```typescript
 * import { waitForEventStatus, waitForSQSMessage, invokeLambda } from '../helpers/e2e-helpers';
 *
 * // Wait for event to reach COMPLETED status
 * const event = await waitForEventStatus(prisma, eventId, 'COMPLETED', 30000);
 *
 * // Wait for SQS message to appear in queue
 * const message = await waitForSQSMessage(sqsClient, queueUrl, 10000);
 *
 * // Invoke Lambda and assert success
 * await invokeLambda(lambdaClient, 'event-scheduler', mockPayload);
 * ```
 *
 * @see tests/e2e/event-scheduling-flow.e2e.test.ts
 * @see docs/architecture/test-strategy.md#Test-Data-Management
 */

/**
 * Polls database until event reaches expected status or timeout.
 *
 * **Use Case:** Wait for worker Lambda to complete event execution asynchronously.
 *
 * **Polling Strategy:**
 * - Poll every 2 seconds
 * - Return immediately when status matches
 * - Throw error if timeout exceeded
 *
 * @param prisma - Prisma client connected to database
 * @param eventId - Event ID to poll
 * @param expectedStatus - Expected status (e.g., 'COMPLETED', 'FAILED')
 * @param timeoutMs - Maximum wait time in milliseconds (default: 30000)
 * @returns Event object with expected status
 * @throws Error if timeout exceeded or event not found
 *
 * @example
 * ```typescript
 * // Wait up to 30 seconds for event to complete
 * const completedEvent = await waitForEventStatus(prisma, eventId, 'COMPLETED', 30000);
 * expect(completedEvent.executedAt).toBeDefined();
 * ```
 */
export async function waitForEventStatus(
  prisma: PrismaClient,
  eventId: string,
  expectedStatus: string,
  timeoutMs: number = 30000
): Promise<{
  id: string;
  status: string;
  executedAt: Date | null;
  version: number;
  [key: string]: any;
}> {
  const pollInterval = 2000; // 2 seconds
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    if (event.status === expectedStatus) {
      return event;
    }
  }

  throw new Error(
    `Timeout waiting for event ${eventId} to reach status ${expectedStatus} after ${timeoutMs}ms`
  );
}

/**
 * Polls SQS queue until message appears or timeout.
 *
 * **Use Case:** Wait for scheduler Lambda to send event to queue.
 *
 * **Polling Strategy:**
 * - Uses long polling (WaitTimeSeconds: 5)
 * - Returns first message received
 * - Throws error if timeout exceeded
 *
 * @param sqsClient - SQS client configured for LocalStack
 * @param queueUrl - SQS queue URL
 * @param timeoutMs - Maximum wait time in milliseconds (default: 10000)
 * @returns First message received from queue
 * @throws Error if timeout exceeded or no messages received
 *
 * @example
 * ```typescript
 * // Wait up to 10 seconds for message to appear in queue
 * const message = await waitForSQSMessage(sqsClient, queueUrl, 10000);
 * const payload = JSON.parse(message.Body!);
 * expect(payload.eventId).toBe(expectedEventId);
 * ```
 */
export async function waitForSQSMessage(
  sqsClient: SQSClient,
  queueUrl: string,
  timeoutMs: number = 10000
): Promise<{ Body?: string; MessageId?: string; [key: string]: any }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5, // Long polling
      })
    );

    if (response.Messages && response.Messages.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return response.Messages[0]!;
    }

    // Wait a bit before next poll if long polling returned nothing
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timeout waiting for SQS message after ${timeoutMs}ms`);
}

/**
 * Invokes Lambda function and asserts successful execution.
 *
 * **Use Case:** Manually trigger Lambda for testing (simulates EventBridge trigger).
 *
 * **Error Handling:**
 * - Asserts StatusCode is 200
 * - Logs payload if FunctionError exists
 * - Throws error if invocation failed
 *
 * @param lambdaClient - Lambda client configured for LocalStack
 * @param functionName - Lambda function name (e.g., 'event-scheduler')
 * @param payload - Payload to send to Lambda (will be JSON stringified)
 * @returns Lambda invocation response
 * @throws Error if invocation failed or FunctionError exists
 *
 * @example
 * ```typescript
 * // Invoke scheduler Lambda with EventBridge event
 * const mockEvent = {
 *   version: '0',
 *   'detail-type': 'Scheduled Event',
 *   source: 'aws.events',
 *   // ...
 * };
 * await invokeLambda(lambdaClient, 'event-scheduler', mockEvent);
 * ```
 */
export async function invokeLambda(
  lambdaClient: LambdaClient,
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ StatusCode?: number; FunctionError?: string; Payload?: Uint8Array }> {
  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );

  if (response.StatusCode !== 200) {
    throw new Error(`Lambda invocation failed with status ${response.StatusCode}: ${functionName}`);
  }

  if (response.FunctionError) {
    const errorPayload = JSON.parse(new TextDecoder().decode(response.Payload)) as Record<
      string,
      unknown
    >;
    console.error('Lambda Function Error:', JSON.stringify(errorPayload, null, 2));
    throw new Error(`Lambda function error: ${response.FunctionError}`);
  }

  return response;
}

/**
 * Creates test user with event in database for E2E tests.
 *
 * **Use Case:** Simplify test setup for E2E scenarios.
 *
 * @param prisma - Prisma client connected to database
 * @param dateOfBirth - User's date of birth (default: today)
 * @param timezone - User's timezone (default: 'America/New_York')
 * @param eventTargetTime - Event target timestamp (default: 1 hour ago - overdue)
 * @returns Created user and event objects
 *
 * @example
 * ```typescript
 * // Create user with birthday today and overdue event
 * const { user, event } = await createTestUser(prisma);
 *
 * // Create user with custom birthday
 * const { user, event } = await createTestUser(
 *   prisma,
 *   new Date('1990-01-15'),
 *   'Europe/London',
 *   DateTime.now().minus({ minutes: 5 }).toJSDate()
 * );
 * ```
 */
export async function createTestUser(
  prisma: PrismaClient,
  dateOfBirth: Date = DateTime.now().toJSDate(),
  timezone: string = 'America/New_York',
  eventTargetTime: Date = DateTime.now().minus({ hours: 1 }).toJSDate()
): Promise<{
  user: { id: string; firstName: string; lastName: string; dateOfBirth: Date; timezone: string };
  event: {
    id: string;
    userId: string;
    status: string;
    targetTimestampUTC: Date;
    idempotencyKey: string;
  };
}> {
  const userId = randomUUID();
  const eventId = randomUUID();

  const user = await prisma.user.create({
    data: {
      id: userId,
      firstName: 'Test',
      lastName: 'User',
      dateOfBirth,
      timezone,
    },
  });

  const event = await prisma.event.create({
    data: {
      id: eventId,
      userId: user.id,
      eventType: 'BIRTHDAY',
      status: 'PENDING',
      targetTimestampUTC: eventTargetTime,
      targetTimestampLocal: DateTime.fromJSDate(eventTargetTime).toISO()!,
      targetTimezone: timezone,
      idempotencyKey: `test-${randomUUID()}`,
      deliveryPayload: { message: 'Happy Birthday!' },
      retryCount: 0,
      version: 1,
    },
  });

  return { user, event };
}
