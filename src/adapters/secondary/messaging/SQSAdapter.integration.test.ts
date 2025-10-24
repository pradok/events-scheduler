/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

import {
  SQSClient,
  CreateQueueCommand,
  DeleteQueueCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import { SQSAdapter } from './SQSAdapter';
import type { SQSMessagePayload } from '../../../shared/validation/schemas';
import { ValidationError } from '../../../domain/errors/ValidationError';

/**
 * Integration Tests for SQSAdapter with LocalStack SQS
 *
 * These tests verify that the SQSAdapter correctly interacts with a real
 * SQS queue (LocalStack) including:
 * - Message sending
 * - Message attributes
 * - Schema validation
 * - Error handling
 *
 * **Prerequisites:**
 * - LocalStack must be running (docker-compose up)
 * - SQS service must be available at http://localhost:4566
 *
 * **Test Isolation:**
 * - Creates a unique test queue before each test
 * - Deletes the queue after each test
 * - No shared state between tests
 */
describe('SQSAdapter Integration Tests', () => {
  let sqsClient: SQSClient;
  let adapter: SQSAdapter;
  let testQueueUrl: string;
  const testQueueName = `test-queue-${Date.now()}`;

  beforeAll(async () => {
    // Create SQS client configured for LocalStack
    // Uses AWS_ENDPOINT_URL environment variable (standard AWS SDK v3 variable)
    sqsClient = new SQSClient({
      region: 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
  }, 30000);

  beforeEach(async () => {
    // Create test queue
    const createQueueResponse = await sqsClient.send(
      new CreateQueueCommand({
        QueueName: testQueueName,
        Attributes: {
          VisibilityTimeout: '30',
          MessageRetentionPeriod: '300', // 5 minutes for testing
        },
      })
    );

    testQueueUrl = createQueueResponse.QueueUrl!;

    // Create adapter with test queue URL
    adapter = new SQSAdapter(sqsClient, testQueueUrl);
  }, 30000);

  afterEach(async () => {
    // Clean up: Delete test queue
    try {
      await sqsClient.send(
        new DeleteQueueCommand({
          QueueUrl: testQueueUrl,
        })
      );
    } catch (error) {
      // Queue might not exist if test failed early
      console.warn('Failed to delete test queue:', error);
    }
  }, 30000);

  afterAll(async () => {
    // Close SQS client connection
    sqsClient.destroy();
  });

  describe('sendMessage', () => {
    const validPayload: SQSMessagePayload = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'BIRTHDAY',
      idempotencyKey: 'event-integration-test-123',
      metadata: {
        userId: '660e8400-e29b-41d4-a716-446655440001',
        targetTimestampUTC: '2025-01-15T09:00:00.000Z',
        deliveryPayload: {
          message: 'Integration test message',
          userName: 'Test User',
        },
      },
    };

    it('should send message to LocalStack SQS queue successfully', async () => {
      // Act
      const messageId = await adapter.sendMessage(validPayload);

      // Assert
      expect(messageId).toBeDefined();
      expect(messageId).not.toBe('');

      // Verify message is in queue by receiving it
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: testQueueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 5,
        })
      );

      expect(receiveResponse.Messages).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(receiveResponse.Messages![0]!.MessageId).toBe(messageId);
    }, 15000);

    it('should send message body as JSON string matching payload', async () => {
      // Act
      await adapter.sendMessage(validPayload);

      // Assert - Receive message and verify body
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: testQueueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 5,
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const message = receiveResponse.Messages![0]!;
      const receivedPayload = JSON.parse(message.Body!);

      expect(receivedPayload).toEqual(validPayload);
    }, 15000);

    it('should include message attributes (eventType, idempotencyKey)', async () => {
      // Act
      await adapter.sendMessage(validPayload);

      // Assert - Receive message with attributes
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: testQueueUrl,
          MaxNumberOfMessages: 1,
          MessageAttributeNames: ['All'],
          WaitTimeSeconds: 5,
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const message = receiveResponse.Messages![0]!;

      expect(message.MessageAttributes).toBeDefined();
      expect(message.MessageAttributes!.eventType).toEqual({
        DataType: 'String',
        StringValue: validPayload.eventType,
      });
      expect(message.MessageAttributes!.idempotencyKey).toEqual({
        DataType: 'String',
        StringValue: validPayload.idempotencyKey,
      });
    }, 15000);

    it('should throw ValidationError for invalid payload (missing eventId)', async () => {
      // Arrange
      const invalidPayload = {
        // Missing eventId
        eventType: 'BIRTHDAY',
        idempotencyKey: 'test-key',
        metadata: {
          userId: '660e8400-e29b-41d4-a716-446655440001',
          targetTimestampUTC: '2025-01-15T09:00:00.000Z',
          deliveryPayload: {},
        },
      } as SQSMessagePayload;

      // Act & Assert
      await expect(adapter.sendMessage(invalidPayload)).rejects.toThrow(ValidationError);

      // Verify no message was sent to queue
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: testQueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
        })
      );

      expect(receiveResponse.Messages).toBeUndefined();
    }, 15000);

    it('should throw ValidationError for invalid eventId format (not UUID)', async () => {
      // Arrange
      const invalidPayload = {
        eventId: 'not-a-valid-uuid',
        eventType: 'BIRTHDAY',
        idempotencyKey: 'test-key',
        metadata: {
          userId: '660e8400-e29b-41d4-a716-446655440001',
          targetTimestampUTC: '2025-01-15T09:00:00.000Z',
          deliveryPayload: {},
        },
      } as SQSMessagePayload;

      // Act & Assert
      await expect(adapter.sendMessage(invalidPayload)).rejects.toThrow(ValidationError);

      // Verify no message was sent to queue
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: testQueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
        })
      );

      expect(receiveResponse.Messages).toBeUndefined();
    }, 15000);

    it('should handle complex nested deliveryPayload correctly', async () => {
      // Arrange
      const complexPayload: SQSMessagePayload = {
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          deliveryPayload: {
            message: 'Complex message',
            user: {
              firstName: 'John',
              lastName: 'Doe',
              preferences: {
                language: 'en',
                timezone: 'America/New_York',
              },
            },
            tags: ['birthday', 'celebration', 'important'],
            count: 42,
          },
        },
      };

      // Act
      await adapter.sendMessage(complexPayload);

      // Assert - Verify complex payload is correctly serialized and deserialized
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: testQueueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 5,
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const receivedPayload = JSON.parse(receiveResponse.Messages![0]!.Body!);
      expect(receivedPayload.metadata.deliveryPayload).toEqual(
        complexPayload.metadata.deliveryPayload
      );
    }, 15000);

    it('should handle multiple messages sent in sequence', async () => {
      // Arrange
      const message1: SQSMessagePayload = {
        ...validPayload,
        eventId: '550e8400-e29b-41d4-a716-446655440001',
        idempotencyKey: 'key-1',
      };

      const message2: SQSMessagePayload = {
        ...validPayload,
        eventId: '550e8400-e29b-41d4-a716-446655440002',
        idempotencyKey: 'key-2',
      };

      const message3: SQSMessagePayload = {
        ...validPayload,
        eventId: '550e8400-e29b-41d4-a716-446655440003',
        idempotencyKey: 'key-3',
      };

      // Act - Send 3 messages
      const messageId1 = await adapter.sendMessage(message1);
      const messageId2 = await adapter.sendMessage(message2);
      const messageId3 = await adapter.sendMessage(message3);

      // Assert - All messages have unique IDs
      expect(messageId1).not.toBe(messageId2);
      expect(messageId2).not.toBe(messageId3);
      expect(messageId1).not.toBe(messageId3);

      // Receive all messages
      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: testQueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5,
        })
      );

      // All 3 messages should be in queue
      expect(receiveResponse.Messages).toHaveLength(3);

      const receivedEventIds = receiveResponse
        .Messages!.map((msg) => JSON.parse(msg.Body!).eventId)
        .sort();

      expect(receivedEventIds).toEqual(
        [message1.eventId, message2.eventId, message3.eventId].sort()
      );
    }, 20000);
  });
});
