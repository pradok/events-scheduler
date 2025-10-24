import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { handler } from './workerHandler';
import { ExecuteEventUseCase } from '../../../modules/event-scheduling/application/use-cases/ExecuteEventUseCase';
import { ValidationError } from '../../../domain/errors/ValidationError';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError';
import { logger } from '../../../shared/logger';

// Mock dependencies
jest.mock('../../../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      // Mock Prisma client
    })),
  };
});

jest.mock('../../../modules/event-scheduling/adapters/persistence/PrismaEventRepository');
jest.mock('../../secondary/delivery/WebhookAdapter');
jest.mock('../../../modules/event-scheduling/application/use-cases/ExecuteEventUseCase');

describe('workerHandler', () => {
  const mockExecute = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ExecuteEventUseCase constructor to return mock with execute method
    /* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
    (ExecuteEventUseCase as jest.MockedClass<typeof ExecuteEventUseCase>).mockImplementation(
      () =>
        ({
          execute: mockExecute,
        }) as any
    );
    /* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

    // Set environment variables
    process.env.WEBHOOK_TEST_URL = 'https://test.webhook.com/events';
  });

  afterEach(() => {
    jest.resetModules();
  });

  /**
   * Helper function to create a mock SQS event
   */
  function createSQSEvent(records: Array<Partial<SQSRecord>>): SQSEvent {
    return {
      Records: records.map((r) => ({
        messageId: r.messageId || 'test-message-id',
        receiptHandle: r.receiptHandle || 'test-receipt-handle',
        body:
          r.body ||
          JSON.stringify({
            eventId: '123e4567-e89b-12d3-a456-426614174000',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'test-idempotency-key',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440001',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Test message' },
            },
          }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '1234567890000',
          SenderId: 'test-sender',
          ApproximateFirstReceiveTimestamp: '1234567890000',
        },
        messageAttributes: {},
        md5OfBody: 'test-md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:events-queue',
        awsRegion: 'us-east-1',
      })),
    };
  }

  describe('Success Scenarios', () => {
    it('should process message with valid payload successfully', async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce(undefined);
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-001',
          body: JSON.stringify({
            eventId: '123e4567-e89b-12d3-a456-426614174000',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'test-key-001',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440001',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Happy Birthday!' },
            },
          }),
        },
      ]);

      // Act
      await handler(sqsEvent);

      // Assert
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'SQS message processed successfully',
          messageId: 'msg-001',
          eventId: '123e4567-e89b-12d3-a456-426614174000',
          idempotencyKey: 'test-key-001',
        })
      );
    });

    it('should process all messages in batch independently', async () => {
      // Arrange
      mockExecute.mockResolvedValue(undefined);
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-001',
          body: JSON.stringify({
            eventId: '123e4567-e89b-12d3-a456-426614174001',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'key-001',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440001',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Message 1' },
            },
          }),
        },
        {
          messageId: 'msg-002',
          body: JSON.stringify({
            eventId: '123e4567-e89b-12d3-a456-426614174002',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'key-002',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440002',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Message 2' },
            },
          }),
        },
        {
          messageId: 'msg-003',
          body: JSON.stringify({
            eventId: '123e4567-e89b-12d3-a456-426614174003',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'key-003',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440003',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Message 3' },
            },
          }),
        },
      ]);

      // Act
      await handler(sqsEvent);

      // Assert
      expect(mockExecute).toHaveBeenCalledTimes(3);
      expect(mockExecute).toHaveBeenNthCalledWith(1, '123e4567-e89b-12d3-a456-426614174001');
      expect(mockExecute).toHaveBeenNthCalledWith(2, '123e4567-e89b-12d3-a456-426614174002');
      expect(mockExecute).toHaveBeenNthCalledWith(3, '123e4567-e89b-12d3-a456-426614174003');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Worker Lambda execution completed',
          messagesProcessed: 3,
        })
      );
    });

    it('should log processing start and completion', async () => {
      // Arrange
      mockExecute.mockResolvedValue(undefined);
      const sqsEvent = createSQSEvent([{ messageId: 'msg-001' }]);

      // Act
      await handler(sqsEvent);

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Worker Lambda execution started',
          messageCount: 1,
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Worker Lambda execution completed',
          messagesProcessed: 1,
        })
      );
    });
  });

  describe('Validation Error Scenarios', () => {
    it('should throw ValidationError for invalid message payload (missing eventId)', async () => {
      // Arrange
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-invalid',
          body: JSON.stringify({
            // Missing eventId
            eventType: 'BIRTHDAY',
            idempotencyKey: 'test-key',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440001',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Test' },
            },
          }),
        },
      ]);

      // Act & Assert
      await expect(handler(sqsEvent)).rejects.toThrow(ValidationError);
      expect(mockExecute).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Invalid SQS message payload - sending to DLQ',
          messageId: 'msg-invalid',
        })
      );
    });

    it('should throw ValidationError for invalid UUID format', async () => {
      // Arrange
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-invalid-uuid',
          body: JSON.stringify({
            eventId: 'not-a-uuid',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'test-key',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440001',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Test' },
            },
          }),
        },
      ]);

      // Act & Assert
      await expect(handler(sqsEvent)).rejects.toThrow(ValidationError);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for malformed JSON', async () => {
      // Arrange
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-malformed',
          body: 'not valid json{',
        },
      ]);

      // Act & Assert
      await expect(handler(sqsEvent)).rejects.toThrow(ValidationError);
      expect(mockExecute).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Failed to parse SQS message body as JSON - sending to DLQ',
          messageId: 'msg-malformed',
        })
      );
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should throw InfrastructureError to trigger SQS retry', async () => {
      // Arrange
      const infrastructureError = new InfrastructureError('Service unavailable');
      mockExecute.mockRejectedValueOnce(infrastructureError);
      const sqsEvent = createSQSEvent([{ messageId: 'msg-retry' }]);

      // Act & Assert
      await expect(handler(sqsEvent)).rejects.toThrow(InfrastructureError);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Transient failure executing event - message will retry',
          messageId: 'msg-retry',
        })
      );
    });

    it('should NOT throw on PermanentDeliveryError (ExecuteEventUseCase handles internally)', async () => {
      // Arrange
      // Note: ExecuteEventUseCase catches PermanentDeliveryError and marks event FAILED
      // It does NOT rethrow, so handler should complete successfully
      mockExecute.mockResolvedValueOnce(undefined);
      const sqsEvent = createSQSEvent([{ messageId: 'msg-permanent-fail' }]);

      // Act
      await handler(sqsEvent);

      // Assert
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'SQS message processed successfully',
          messageId: 'msg-permanent-fail',
        })
      );
    });

    it('should throw unexpected errors to trigger SQS retry (safety mechanism)', async () => {
      // Arrange
      const unexpectedError = new Error('Unexpected database error');
      mockExecute.mockRejectedValueOnce(unexpectedError);
      const sqsEvent = createSQSEvent([{ messageId: 'msg-unexpected' }]);

      // Act & Assert
      await expect(handler(sqsEvent)).rejects.toThrow('Unexpected database error');
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Unexpected error executing event - message will retry',
          messageId: 'msg-unexpected',
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty batch without errors', async () => {
      // Arrange
      const sqsEvent: SQSEvent = { Records: [] };

      // Act
      await handler(sqsEvent);

      // Assert
      expect(mockExecute).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Worker Lambda execution started',
          messageCount: 0,
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Worker Lambda execution completed',
          messagesProcessed: 0,
        })
      );
    });

    it('should process valid messages even when batch contains invalid messages', async () => {
      // Arrange
      mockExecute.mockResolvedValue(undefined);
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-001-valid',
          body: JSON.stringify({
            eventId: '123e4567-e89b-12d3-a456-426614174001',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'key-001',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440001',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Valid message' },
            },
          }),
        },
        {
          messageId: 'msg-002-invalid',
          body: 'invalid json',
        },
      ]);

      // Act
      // First message processes successfully, second throws ValidationError
      await expect(handler(sqsEvent)).rejects.toThrow(ValidationError);

      // Assert
      // First message was processed before error occurred
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174001');
    });

    it('should include duration in success logs', async () => {
      // Arrange
      mockExecute.mockResolvedValue(undefined);
      const sqsEvent = createSQSEvent([{ messageId: 'msg-duration' }]);

      // Act
      await handler(sqsEvent);

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'SQS message processed successfully',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          durationMs: expect.any(Number),
        })
      );
    });

    it('should include duration in error logs', async () => {
      // Arrange
      const error = new InfrastructureError('Service timeout');
      mockExecute.mockRejectedValue(error);
      const sqsEvent = createSQSEvent([{ messageId: 'msg-error-duration' }]);

      // Act & Assert
      await expect(handler(sqsEvent)).rejects.toThrow(InfrastructureError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Transient failure executing event - message will retry',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          durationMs: expect.any(Number),
        })
      );
    });
  });

  describe('Logging', () => {
    it('should log structured data with messageId, eventId, and idempotencyKey', async () => {
      // Arrange
      mockExecute.mockResolvedValue(undefined);
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-logging-test',
          body: JSON.stringify({
            eventId: '123e4567-e89b-12d3-a456-426614174999',
            eventType: 'BIRTHDAY',
            idempotencyKey: 'key-logging-test',
            metadata: {
              userId: '660e8400-e29b-41d4-a716-446655440999',
              targetTimestampUTC: '2025-10-24T09:00:00.000Z',
              deliveryPayload: { message: 'Logging test' },
            },
          }),
        },
      ]);

      // Act
      await handler(sqsEvent);

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Processing SQS message',
          messageId: 'msg-logging-test',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Executing event from SQS message',
          messageId: 'msg-logging-test',
          eventId: '123e4567-e89b-12d3-a456-426614174999',
          idempotencyKey: 'key-logging-test',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'SQS message processed successfully',
          messageId: 'msg-logging-test',
          eventId: '123e4567-e89b-12d3-a456-426614174999',
          idempotencyKey: 'key-logging-test',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          durationMs: expect.any(Number),
        })
      );
    });

    it('should log validation errors with error details', async () => {
      // Arrange
      const sqsEvent = createSQSEvent([
        {
          messageId: 'msg-validation-log',
          body: JSON.stringify({
            // Missing required fields
            eventType: 'BIRTHDAY',
          }),
        },
      ]);

      // Act & Assert
      await expect(handler(sqsEvent)).rejects.toThrow(ValidationError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Invalid SQS message payload - sending to DLQ',
          messageId: 'msg-validation-log',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          validationErrors: expect.any(Array),
        })
      );
    });
  });
});
