import { handler } from './workerHandler';
import { PrismaClient } from '@prisma/client';
import type { SQSEvent } from 'aws-lambda';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DateTime } from 'luxon';
import nock from 'nock';

/**
 * Integration Tests for Worker Lambda Handler
 *
 * Tests the complete worker workflow with real infrastructure:
 * - PostgreSQL database (Testcontainers)
 * - Real Prisma client with migrations
 * - Mocked webhook endpoint (nock)
 * - Worker handler (end-to-end flow)
 *
 * **Test Scenarios:**
 * 1. Processes valid SQS messages and executes events
 * 2. Validates message payloads against SQSMessagePayloadSchema
 * 3. Marks events as COMPLETED on successful webhook delivery
 * 4. Marks events as FAILED on permanent webhook failures (4xx)
 * 5. Leaves events PROCESSING on transient webhook failures (5xx) for SQS retry
 * 6. Handles validation errors by throwing (sends to DLQ)
 *
 * **Infrastructure:**
 * - Testcontainers PostgreSQL 16 (real database)
 * - nock for HTTP mocking (webhook endpoint)
 * - Real Prisma client with migrations
 *
 * @see src/adapters/primary/lambda/workerHandler.ts
 * @see docs/stories/2.6.worker-lambda-sqs-consumer.story.md
 */
describe('workerHandler - Integration Tests', () => {
  let postgresContainer: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  const webhookUrl = 'https://test.webhook.com/events';

  /**
   * Helper function to create a mock SQS event
   */
  function createSQSEvent(messages: Array<{ eventId: string; eventType?: string }>): SQSEvent {
    return {
      Records: messages.map((msg, index) => ({
        messageId: `msg-${index + 1}`,
        receiptHandle: `receipt-${index + 1}`,
        body: JSON.stringify({
          eventId: msg.eventId,
          eventType: msg.eventType || 'BIRTHDAY',
          idempotencyKey: `key-${msg.eventId}`,
          metadata: {
            userId: '660e8400-e29b-41d4-a716-446655440001',
            targetTimestampUTC: DateTime.now().toISO(),
            deliveryPayload: {
              message: 'Test message',
              webhookUrl: webhookUrl,
            },
          },
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: String(Date.now()),
          SenderId: 'test-sender',
          ApproximateFirstReceiveTimestamp: String(Date.now()),
        },
        messageAttributes: {},
        md5OfBody: 'test-md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:events-queue',
        awsRegion: 'us-east-1',
      })),
    };
  }

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

    // Set environment variables for handler
    process.env.DATABASE_URL = connectionString;
    process.env.WEBHOOK_TEST_URL = webhookUrl;
  }, 120000); // 2 minutes timeout for container startup

  afterAll(async () => {
    await prisma.$disconnect();
    await postgresContainer.stop();
    nock.cleanAll();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();

    // Clean up nock interceptors
    nock.cleanAll();
  });

  describe('Happy Path - Process Valid Messages', () => {
    it('should process valid SQS message and mark event as COMPLETED', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
        },
      });

      // Arrange: Create PROCESSING event (already claimed by scheduler)
      const event = await prisma.event.create({
        data: {
          id: '123e4567-e89b-12d3-a456-426614174001',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PROCESSING',
          targetTimestampUTC: DateTime.now().minus({ minutes: 5 }).toJSDate(),
          targetTimestampLocal: DateTime.now().minus({ minutes: 5 }).toJSDate(),
          targetTimezone: 'America/New_York',
          idempotencyKey: 'test-key-001',
          deliveryPayload: {
            message: 'Happy Birthday, John Doe!',
            webhookUrl: webhookUrl,
          },
          version: 2, // Version incremented when claimed
        },
      });

      // Arrange: Mock successful webhook response
      nock('https://test.webhook.com')
        .post('/events', {
          message: 'Happy Birthday, John Doe!',
          webhookUrl: webhookUrl,
        })
        .reply(200, { success: true, timestamp: DateTime.now().toISO() });

      // Arrange: Create SQS event
      const sqsEvent = createSQSEvent([{ eventId: event.id }]);

      // Act: Process message
      await handler(sqsEvent);

      // Assert: Event status updated to COMPLETED
      const updatedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(updatedEvent).not.toBeNull();
      expect(updatedEvent!.status).toBe('COMPLETED');
      expect(updatedEvent!.executedAt).not.toBeNull();
      expect(updatedEvent!.failureReason).toBeNull();

      // Assert: Webhook was called
      expect(nock.isDone()).toBe(true);
    });

    it('should process batch of messages independently', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: new Date('1992-03-20'),
          timezone: 'Europe/London',
        },
      });

      // Arrange: Create 3 PROCESSING events
      const eventIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const event = await prisma.event.create({
          data: {
            id: `123e4567-e89b-12d3-a456-42661417400${i}`,
            userId: user.id,
            eventType: 'BIRTHDAY',
            status: 'PROCESSING',
            targetTimestampUTC: DateTime.now().minus({ minutes: 5 }).toJSDate(),
            targetTimestampLocal: DateTime.now().minus({ minutes: 5 }).toJSDate(),
            targetTimezone: 'Europe/London',
            idempotencyKey: `test-key-00${i}`,
            deliveryPayload: {
              message: `Message ${i}`,
              webhookUrl: webhookUrl,
            },
            version: 2,
          },
        });
        eventIds.push(event.id);
      }

      // Arrange: Mock successful webhook responses
      for (let i = 0; i < 3; i++) {
        nock('https://test.webhook.com')
          .post('/events', {
            message: `Message ${i}`,
            webhookUrl: webhookUrl,
          })
          .reply(200, { success: true });
      }

      // Arrange: Create SQS event with 3 messages
      const sqsEvent = createSQSEvent(eventIds.map((id) => ({ eventId: id })));

      // Act: Process batch
      await handler(sqsEvent);

      // Assert: All events marked as COMPLETED
      for (const eventId of eventIds) {
        const event = await prisma.event.findUnique({
          where: { id: eventId },
        });
        expect(event!.status).toBe('COMPLETED');
        expect(event!.executedAt).not.toBeNull();
      }

      // Assert: All webhooks were called
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('Validation Errors', () => {
    it('should throw ValidationError for invalid message payload', async () => {
      // Arrange: Invalid SQS event (missing eventId)
      const invalidEvent: SQSEvent = {
        Records: [
          {
            messageId: 'msg-invalid',
            receiptHandle: 'receipt-invalid',
            body: JSON.stringify({
              // Missing eventId
              eventType: 'BIRTHDAY',
              idempotencyKey: 'test-key',
              metadata: {
                userId: '660e8400-e29b-41d4-a716-446655440001',
                targetTimestampUTC: DateTime.now().toISO(),
                deliveryPayload: {
                  message: 'Test',
                  webhookUrl: webhookUrl,
                },
              },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: String(Date.now()),
              SenderId: 'test-sender',
              ApproximateFirstReceiveTimestamp: String(Date.now()),
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:events-queue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      // Act & Assert: Handler throws ValidationError
      await expect(handler(invalidEvent)).rejects.toThrow('Invalid SQS message payload');
    });
  });

  describe('Permanent Webhook Failures (4xx)', () => {
    it('should mark event as FAILED on 4xx webhook response', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          firstName: 'Bob',
          lastName: 'Johnson',
          dateOfBirth: new Date('1985-07-10'),
          timezone: 'America/Chicago',
        },
      });

      // Arrange: Create PROCESSING event
      const event = await prisma.event.create({
        data: {
          id: '123e4567-e89b-12d3-a456-426614174002',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PROCESSING',
          targetTimestampUTC: DateTime.now().minus({ minutes: 5 }).toJSDate(),
          targetTimestampLocal: DateTime.now().minus({ minutes: 5 }).toJSDate(),
          targetTimezone: 'America/Chicago',
          idempotencyKey: 'test-key-002',
          deliveryPayload: {
            message: 'Happy Birthday, Bob!',
            webhookUrl: webhookUrl,
          },
          version: 2,
        },
      });

      // Arrange: Mock 404 webhook response (permanent failure)
      nock('https://test.webhook.com')
        .post('/events', {
          message: 'Happy Birthday, Bob!',
          webhookUrl: webhookUrl,
        })
        .reply(404, { error: 'Endpoint not found' });

      // Arrange: Create SQS event
      const sqsEvent = createSQSEvent([{ eventId: event.id }]);

      // Act: Process message (should complete without throwing)
      await handler(sqsEvent);

      // Assert: Event status updated to FAILED
      const updatedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(updatedEvent).not.toBeNull();
      expect(updatedEvent!.status).toBe('FAILED');
      expect(updatedEvent!.failureReason).toContain('404');
      expect(updatedEvent!.executedAt).toBeNull();
    });
  });

  describe('Transient Webhook Failures (5xx)', () => {
    it('should throw InfrastructureError on 5xx webhook response (triggers SQS retry)', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          firstName: 'Alice',
          lastName: 'Williams',
          dateOfBirth: new Date('1988-12-25'),
          timezone: 'America/Los_Angeles',
        },
      });

      // Arrange: Create PROCESSING event
      const event = await prisma.event.create({
        data: {
          id: '123e4567-e89b-12d3-a456-426614174003',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PROCESSING',
          targetTimestampUTC: DateTime.now().minus({ minutes: 5 }).toJSDate(),
          targetTimestampLocal: DateTime.now().minus({ minutes: 5 }).toJSDate(),
          targetTimezone: 'America/Los_Angeles',
          idempotencyKey: 'test-key-003',
          deliveryPayload: {
            message: 'Happy Birthday, Alice!',
            webhookUrl: webhookUrl,
          },
          version: 2,
        },
      });

      // Arrange: Mock 503 webhook response (transient failure)
      // WebhookAdapter retries 3 times, so mock all attempts
      nock('https://test.webhook.com')
        .post('/events', {
          message: 'Happy Birthday, Alice!',
          webhookUrl: webhookUrl,
        })
        .times(4)
        .reply(503, { error: 'Service unavailable' });

      // Arrange: Create SQS event
      const sqsEvent = createSQSEvent([{ eventId: event.id }]);

      // Act & Assert: Handler throws InfrastructureError (triggers SQS retry)
      await expect(handler(sqsEvent)).rejects.toThrow();

      // Assert: Event status remains PROCESSING (not updated)
      const updatedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });

      expect(updatedEvent).not.toBeNull();
      expect(updatedEvent!.status).toBe('PROCESSING');
      expect(updatedEvent!.executedAt).toBeNull();
    });
  });

  describe('Event Not Found', () => {
    it('should complete successfully when event not found (idempotent)', async () => {
      // Arrange: Create SQS event for non-existent event
      const sqsEvent = createSQSEvent([{ eventId: '00000000-0000-0000-0000-000000000000' }]);

      // Act: Process message (should not throw)
      await handler(sqsEvent);

      // No assertions needed - test passes if no error thrown
    });
  });
});
