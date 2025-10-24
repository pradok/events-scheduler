import { handler } from './schedulerHandler';
import { PrismaClient } from '@prisma/client';
import {
  SQSClient,
  ReceiveMessageCommand,
  PurgeQueueCommand,
  CreateQueueCommand,
  DeleteQueueCommand,
} from '@aws-sdk/client-sqs';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DateTime } from 'luxon';

/**
 * Integration Tests for Scheduler Lambda Handler
 *
 * Tests the complete scheduler workflow with real infrastructure:
 * - PostgreSQL database (Testcontainers)
 * - LocalStack SQS (real AWS SDK calls)
 * - Scheduler handler (end-to-end flow)
 *
 * **Test Scenarios:**
 * 1. Claims PENDING events with targetTimestampUTC <= now
 * 2. Sends claimed events to LocalStack SQS queue
 * 3. Verifies event status changed to PROCESSING
 * 4. Verifies SQS messages contain correct payload
 * 5. Does not claim future events
 * 6. Handles empty database gracefully
 *
 * **Infrastructure:**
 * - Testcontainers PostgreSQL 16 (real database)
 * - LocalStack SQS at http://localhost:4566 (must be running)
 * - Real Prisma client with migrations
 *
 * @see src/adapters/primary/lambda/schedulerHandler.ts
 * @see docs/stories/2.3.eventbridge-scheduler-trigger.story.md
 */
describe('schedulerHandler - Integration Tests', () => {
  let postgresContainer: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let sqsClient: SQSClient;
  const queueUrl = process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/events-queue';

  // Mock EventBridge event payload
  const mockEventBridgeEvent = {
    version: '0',
    id: '12345678-1234-1234-1234-123456789012',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '000000000000',
    time: new Date().toISOString(),
    region: 'us-east-1',
    resources: ['arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule'],
    detail: {},
  };

  beforeAll(async () => {
    // Start PostgreSQL container
    postgresContainer = await new PostgreSqlContainer('postgres:16')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    const connectionString = postgresContainer.getConnectionUri();

    // Create Prisma client with test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    });

    // Run Prisma migrations
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execSync } = require('child_process') as {
      execSync: (cmd: string, opts: unknown) => void;
    };
    execSync(`DATABASE_URL="${connectionString}" npx prisma migrate deploy`, {
      stdio: 'inherit',
    });

    // Create SQS client for LocalStack
    sqsClient = new SQSClient({
      region: 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });

    // Create SQS queue for tests
    try {
      await sqsClient.send(new CreateQueueCommand({ QueueName: 'events-queue' }));
    } catch (error) {
      // Queue may already exist, ignore error
    }

    // Set environment variables for handler
    process.env.DATABASE_URL = connectionString;
    process.env.SQS_QUEUE_URL = queueUrl;
    process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
    process.env.AWS_REGION = 'us-east-1';
  }, 120000); // 2 minutes timeout for container startup

  afterAll(async () => {
    // Clean up SQS queue
    try {
      await sqsClient.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    } catch (error) {
      // Ignore cleanup errors
    }

    await prisma.$disconnect();
    await postgresContainer.stop();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();

    // Purge SQS queue before each test
    try {
      await sqsClient.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
      // Wait for purge to complete (LocalStack may take a moment)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      // Queue may be empty, ignore error
    }
  });

  describe('Happy Path - Claims Events and Sends to SQS', () => {
    it('should claim PENDING events and send to LocalStack SQS queue', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
        },
      });

      // Arrange: Create 3 PENDING events (due now)
      const now = DateTime.now();
      const pastTime = now.minus({ hours: 1 });

      const event1 = await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'America/New_York',
          idempotencyKey: 'test-key-1',
          deliveryPayload: { message: 'Happy Birthday John!' },
          retryCount: 0,
          version: 1,
        },
      });

      const event2 = await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440002',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'America/New_York',
          idempotencyKey: 'test-key-2',
          deliveryPayload: { message: 'Happy Birthday John!' },
          retryCount: 0,
          version: 1,
        },
      });

      const event3 = await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440003',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'America/New_York',
          idempotencyKey: 'test-key-3',
          deliveryPayload: { message: 'Happy Birthday John!' },
          retryCount: 0,
          version: 1,
        },
      });

      // Act: Call scheduler handler
      await handler(mockEventBridgeEvent);

      // Assert: Events should be claimed (status changed to PROCESSING)
      const claimedEvent1 = await prisma.event.findUnique({ where: { id: event1.id } });
      const claimedEvent2 = await prisma.event.findUnique({ where: { id: event2.id } });
      const claimedEvent3 = await prisma.event.findUnique({ where: { id: event3.id } });

      expect(claimedEvent1?.status).toBe('PROCESSING');
      expect(claimedEvent2?.status).toBe('PROCESSING');
      expect(claimedEvent3?.status).toBe('PROCESSING');

      // Assert: 3 messages should be in SQS queue
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
        })
      );

      expect(receiveResponse.Messages).toBeDefined();
      expect(receiveResponse.Messages?.length).toBe(3);

      // Assert: Each message should have correct structure
      const messageIds = new Set([event1.id, event2.id, event3.id]);
      receiveResponse.Messages?.forEach((message) => {
        const payload = JSON.parse(message.Body!) as {
          eventId: string;
          eventType: string;
          idempotencyKey: string;
          metadata: unknown;
        };
        expect(payload).toHaveProperty('eventId');
        expect(payload).toHaveProperty('eventType', 'BIRTHDAY');
        expect(payload).toHaveProperty('idempotencyKey');
        expect(payload).toHaveProperty('metadata');
        expect(messageIds.has(payload.eventId)).toBe(true);
      });
    });

    it('should include message attributes in SQS messages', async () => {
      // Arrange: Create test user and event
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440002',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: new Date('1992-03-20'),
          timezone: 'UTC',
        },
      });

      const pastTime = DateTime.now().minus({ hours: 1 });
      await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440004',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'UTC',
          idempotencyKey: 'test-key-4',
          deliveryPayload: { message: 'Happy Birthday Jane!' },
          retryCount: 0,
          version: 1,
        },
      });

      // Act
      await handler(mockEventBridgeEvent);

      // Assert: Verify message attributes
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          MessageAttributeNames: ['All'],
        })
      );

      expect(receiveResponse.Messages).toBeDefined();
      expect(receiveResponse.Messages?.length).toBe(1);

      const message = receiveResponse.Messages?.[0];
      expect(message).toBeDefined();
      expect(message?.MessageAttributes).toBeDefined();
      expect(message?.MessageAttributes?.eventType?.StringValue).toBe('BIRTHDAY');
      expect(message?.MessageAttributes?.idempotencyKey?.StringValue).toBe('test-key-4');
    });
  });

  describe('Edge Cases - Future Events and Empty Database', () => {
    it('should NOT claim events with targetTimestampUTC in future', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440003',
          firstName: 'Bob',
          lastName: 'Johnson',
          dateOfBirth: new Date('1985-06-10'),
          timezone: 'America/Los_Angeles',
        },
      });

      // Arrange: Create event with future timestamp
      const futureTime = DateTime.now().plus({ hours: 2 });
      const futureEvent = await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440005',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: futureTime.toJSDate(),
          targetTimestampLocal: futureTime.toJSDate(),
          targetTimezone: 'America/Los_Angeles',
          idempotencyKey: 'test-key-5',
          deliveryPayload: { message: 'Happy Birthday Bob!' },
          retryCount: 0,
          version: 1,
        },
      });

      // Act
      await handler(mockEventBridgeEvent);

      // Assert: Event should still be PENDING (not claimed)
      const unchangedEvent = await prisma.event.findUnique({ where: { id: futureEvent.id } });
      expect(unchangedEvent?.status).toBe('PENDING');

      // Assert: No messages in SQS queue
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
        })
      );

      expect(receiveResponse.Messages).toBeUndefined();
    });

    it('should handle empty database gracefully', async () => {
      // Arrange: Empty database (no events)

      // Act
      await handler(mockEventBridgeEvent);

      // Assert: Handler completes without error
      // Assert: No messages in SQS queue
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
        })
      );

      expect(receiveResponse.Messages).toBeUndefined();
    });
  });

  describe('Status Filtering - Only PENDING Events', () => {
    it('should NOT claim events with status PROCESSING, COMPLETED, or FAILED', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440004',
          firstName: 'Alice',
          lastName: 'Brown',
          dateOfBirth: new Date('1988-09-25'),
          timezone: 'Europe/London',
        },
      });

      const pastTime = DateTime.now().minus({ hours: 1 });

      // Create events with different statuses
      const processingEvent = await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440006',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PROCESSING',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'Europe/London',
          idempotencyKey: 'test-key-6',
          deliveryPayload: { message: 'Test' },
          retryCount: 0,
          version: 1,
        },
      });

      const completedEvent = await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440007',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'COMPLETED',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'Europe/London',
          idempotencyKey: 'test-key-7',
          deliveryPayload: { message: 'Test' },
          retryCount: 0,
          version: 1,
          executedAt: new Date(),
        },
      });

      const failedEvent = await prisma.event.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440008',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'FAILED',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'Europe/London',
          idempotencyKey: 'test-key-8',
          deliveryPayload: { message: 'Test' },
          retryCount: 3,
          version: 1,
          failureReason: 'Max retries exceeded',
        },
      });

      // Act
      await handler(mockEventBridgeEvent);

      // Assert: None of these events should change status
      const processingEventAfter = await prisma.event.findUnique({
        where: { id: processingEvent.id },
      });
      const completedEventAfter = await prisma.event.findUnique({
        where: { id: completedEvent.id },
      });
      const failedEventAfter = await prisma.event.findUnique({ where: { id: failedEvent.id } });

      expect(processingEventAfter?.status).toBe('PROCESSING');
      expect(completedEventAfter?.status).toBe('COMPLETED');
      expect(failedEventAfter?.status).toBe('FAILED');

      // Assert: No messages in SQS queue
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
        })
      );

      expect(receiveResponse.Messages).toBeUndefined();
    });
  });
});
