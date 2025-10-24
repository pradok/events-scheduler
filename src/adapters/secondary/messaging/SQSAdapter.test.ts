/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SQSAdapter } from './SQSAdapter';
import type { SQSMessagePayload } from '../../../shared/validation/schemas';
import { ValidationError } from '../../../domain/errors/ValidationError';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError';
import { logger } from '../../../shared/logger';

// Mock AWS SDK
jest.mock('@aws-sdk/client-sqs');
jest.mock('../../../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('SQSAdapter', () => {
  let sqsClient: jest.Mocked<SQSClient>;
  let adapter: SQSAdapter;
  const mockQueueUrl = 'http://localhost:4566/000000000000/test-queue';

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock SQS client
    sqsClient = new SQSClient({}) as jest.Mocked<SQSClient>;

    // Create adapter instance
    adapter = new SQSAdapter(sqsClient, mockQueueUrl);
  });

  describe('sendMessage', () => {
    const validPayload: SQSMessagePayload = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'BIRTHDAY',
      idempotencyKey: 'event-abc123',
      metadata: {
        userId: '660e8400-e29b-41d4-a716-446655440001',
        targetTimestampUTC: '2025-01-15T09:00:00.000Z',
        deliveryPayload: {
          message: 'Happy Birthday!',
          userName: 'John Doe',
        },
      },
    };

    it('should send valid message to SQS queue successfully', async () => {
      // Arrange
      const mockMessageId = 'mock-message-id-123';
      const mockSendResponse = { MessageId: mockMessageId };

      sqsClient.send = jest.fn().mockResolvedValue(mockSendResponse);

      // Act
      const messageId = await adapter.sendMessage(validPayload);

      // Assert
      expect(messageId).toBe(mockMessageId);
      expect(sqsClient.send).toHaveBeenCalledTimes(1);

      // Verify SendMessageCommand was created
      const sendCall = (sqsClient.send as jest.Mock).mock.calls[0][0];
      expect(sendCall).toBeInstanceOf(SendMessageCommand);
    });

    it('should include message attributes (eventType, idempotencyKey) in SQS message', async () => {
      // Arrange
      const mockMessageId = 'mock-message-id-456';
      sqsClient.send = jest.fn().mockResolvedValue({ MessageId: mockMessageId });

      // Act
      await adapter.sendMessage(validPayload);

      // Assert - Verify send was called and command was created
      expect(sqsClient.send).toHaveBeenCalledTimes(1);
      const sendCall = (sqsClient.send as jest.Mock).mock.calls[0][0];
      expect(sendCall).toBeInstanceOf(SendMessageCommand);
    });

    it('should log successful message send with structured context', async () => {
      // Arrange
      const mockMessageId = 'mock-message-id-789';
      sqsClient.send = jest.fn().mockResolvedValue({ MessageId: mockMessageId });

      // Act
      await adapter.sendMessage(validPayload);

      // Assert
      expect(logger.info).toHaveBeenCalledWith({
        msg: 'SQS message sent successfully',
        eventId: validPayload.eventId,
        messageId: mockMessageId,
        eventType: validPayload.eventType,
        queueUrl: mockQueueUrl,
      });
    });

    it('should throw ValidationError for invalid payload (missing eventId)', async () => {
      // Arrange
      const invalidPayload = {
        // Missing eventId
        eventType: 'BIRTHDAY',
        idempotencyKey: 'event-abc123',
        metadata: {
          userId: '660e8400-e29b-41d4-a716-446655440001',
          targetTimestampUTC: '2025-01-15T09:00:00.000Z',
          deliveryPayload: {},
        },
      } as SQSMessagePayload;

      // Act & Assert
      await expect(adapter.sendMessage(invalidPayload)).rejects.toThrow(ValidationError);
      await expect(adapter.sendMessage(invalidPayload)).rejects.toThrow(
        /Invalid SQS message payload/
      );

      // Verify SQS client was NOT called
      expect(sqsClient.send).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid eventId (not a UUID)', async () => {
      // Arrange
      const invalidPayload = {
        eventId: 'not-a-uuid', // Invalid UUID format
        eventType: 'BIRTHDAY',
        idempotencyKey: 'event-abc123',
        metadata: {
          userId: '660e8400-e29b-41d4-a716-446655440001',
          targetTimestampUTC: '2025-01-15T09:00:00.000Z',
          deliveryPayload: {},
        },
      } as SQSMessagePayload;

      // Act & Assert
      await expect(adapter.sendMessage(invalidPayload)).rejects.toThrow(ValidationError);

      // Verify SQS client was NOT called
      expect(sqsClient.send).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid metadata.userId (not a UUID)', async () => {
      // Arrange
      const invalidPayload = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        eventType: 'BIRTHDAY',
        idempotencyKey: 'event-abc123',
        metadata: {
          userId: 'invalid-user-id', // Invalid UUID format
          targetTimestampUTC: '2025-01-15T09:00:00.000Z',
          deliveryPayload: {},
        },
      } as SQSMessagePayload;

      // Act & Assert
      await expect(adapter.sendMessage(invalidPayload)).rejects.toThrow(ValidationError);

      // Verify SQS client was NOT called
      expect(sqsClient.send).not.toHaveBeenCalled();
    });

    it('should log validation error as warning with validation details', async () => {
      // Arrange
      const invalidPayload = {
        // Missing eventId
        eventType: 'BIRTHDAY',
        idempotencyKey: 'event-abc123',
        metadata: {
          userId: '660e8400-e29b-41d4-a716-446655440001',
          targetTimestampUTC: '2025-01-15T09:00:00.000Z',
          deliveryPayload: {},
        },
      } as SQSMessagePayload;

      // Act
      try {
        await adapter.sendMessage(invalidPayload);
      } catch {
        // Expected error
      }

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Invalid SQS message payload',
          eventId: undefined, // eventId is missing
          validationErrors: expect.any(Array),
        })
      );
    });

    it('should throw InfrastructureError when SQS send fails', async () => {
      // Arrange
      const sqsError = new Error('QueueDoesNotExist');
      sqsError.name = 'QueueDoesNotExist';
      sqsClient.send = jest.fn().mockRejectedValue(sqsError);

      // Act & Assert
      await expect(adapter.sendMessage(validPayload)).rejects.toThrow(InfrastructureError);
      await expect(adapter.sendMessage(validPayload)).rejects.toThrow(
        /SQS send failed: QueueDoesNotExist/
      );
    });

    it('should log SQS error with structured context', async () => {
      // Arrange
      const sqsError = new Error('ServiceUnavailable');
      sqsError.name = 'ServiceUnavailable';
      sqsClient.send = jest.fn().mockRejectedValue(sqsError);

      // Act
      try {
        await adapter.sendMessage(validPayload);
      } catch {
        // Expected error
      }

      // Assert
      expect(logger.error).toHaveBeenCalledWith({
        msg: 'Failed to send SQS message',
        error: 'ServiceUnavailable',
        errorName: 'ServiceUnavailable',
        eventId: validPayload.eventId,
        queueUrl: mockQueueUrl,
      });
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Arrange
      sqsClient.send = jest.fn().mockRejectedValue('Non-error exception');

      // Act & Assert
      await expect(adapter.sendMessage(validPayload)).rejects.toThrow(InfrastructureError);
      await expect(adapter.sendMessage(validPayload)).rejects.toThrow(
        /SQS send failed: Non-error exception/
      );
    });

    it('should log non-Error exceptions as string', async () => {
      // Arrange
      sqsClient.send = jest.fn().mockRejectedValue('Non-error exception');

      // Act
      try {
        await adapter.sendMessage(validPayload);
      } catch {
        // Expected error
      }

      // Assert
      expect(logger.error).toHaveBeenCalledWith({
        msg: 'Failed to send SQS message',
        error: 'Non-error exception',
        errorName: 'UnknownError',
        eventId: validPayload.eventId,
        queueUrl: mockQueueUrl,
      });
    });

    it('should handle network timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      sqsClient.send = jest.fn().mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(adapter.sendMessage(validPayload)).rejects.toThrow(InfrastructureError);
      await expect(adapter.sendMessage(validPayload)).rejects.toThrow(
        /SQS send failed: Request timeout/
      );

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Failed to send SQS message',
          error: 'Request timeout',
          errorName: 'TimeoutError',
        })
      );
    });

    it('should serialize complex deliveryPayload correctly', async () => {
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
              nested: {
                value: 123,
                array: [1, 2, 3],
              },
            },
          },
        },
      };

      sqsClient.send = jest.fn().mockResolvedValue({ MessageId: 'msg-complex' });

      // Act
      const messageId = await adapter.sendMessage(complexPayload);

      // Assert
      expect(messageId).toBe('msg-complex');
      expect(sqsClient.send).toHaveBeenCalledTimes(1);
      const sendCall = (sqsClient.send as jest.Mock).mock.calls[0][0];
      expect(sendCall).toBeInstanceOf(SendMessageCommand);
    });
  });
});
