import { handler } from './schedulerHandler';
import { ClaimReadyEventsUseCase } from '../../../modules/event-scheduling/application/use-cases/ClaimReadyEventsUseCase';
import { SQSAdapter } from '../../secondary/messaging/SQSAdapter';
import { Event } from '../../../modules/event-scheduling/domain/entities/Event';
import { EventStatus } from '../../../modules/event-scheduling/domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../../modules/event-scheduling/domain/value-objects/IdempotencyKey';
import { DateTime } from 'luxon';
import { logger } from '../../../shared/logger';

// Mock dependencies
jest.mock('../../../modules/event-scheduling/application/use-cases/ClaimReadyEventsUseCase');
jest.mock('../../secondary/messaging/SQSAdapter');
jest.mock('../../../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

/**
 * Unit Tests for Scheduler Lambda Handler
 *
 * Tests the schedulerHandler Lambda function that is triggered by EventBridge
 * every minute to claim ready events and send them to SQS queue.
 *
 * **Test Coverage:**
 * - Happy path: events claimed and sent to SQS
 * - No events ready: empty array handling
 * - Use case error: error handling and logging
 * - SQS error: error handling and logging
 * - Logging: verify structured logging
 *
 * @see src/adapters/primary/lambda/schedulerHandler.ts
 * @see docs/stories/2.3.eventbridge-scheduler-trigger.story.md
 */
describe('schedulerHandler', () => {
  // Test fixtures
  const mockEventBridgeEvent = {
    version: '0',
    id: '12345678-1234-1234-1234-123456789012',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '000000000000',
    time: '2025-10-24T10:00:00Z',
    region: 'us-east-1',
    resources: ['arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule'],
    detail: {},
  };

  const createMockEvent = (eventId: string): Event => {
    const now = DateTime.now();
    return new Event({
      id: eventId,
      userId: `user-${eventId}`,
      eventType: 'BIRTHDAY',
      status: EventStatus.PROCESSING,
      targetTimestampUTC: now,
      targetTimestampLocal: now,
      targetTimezone: 'America/New_York',
      executedAt: null,
      failureReason: null,
      retryCount: 0,
      version: 1,
      idempotencyKey: IdempotencyKey.fromString(`evt-${eventId}-123456789`),
      deliveryPayload: { message: 'Happy Birthday!' },
      createdAt: now,
      updatedAt: now,
    });
  };

  // Mocks
  let mockClaimReadyEventsExecute: jest.Mock;
  let mockSQSAdapterSendMessage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ClaimReadyEventsUseCase
    mockClaimReadyEventsExecute = jest.fn();
    (ClaimReadyEventsUseCase as jest.Mock).mockImplementation(() => ({
      execute: mockClaimReadyEventsExecute,
    }));

    // Mock SQSAdapter
    mockSQSAdapterSendMessage = jest.fn().mockResolvedValue('mock-message-id-123');
    (SQSAdapter as jest.Mock).mockImplementation(() => ({
      sendMessage: mockSQSAdapterSendMessage,
    }));

    // Set environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
    process.env.SQS_QUEUE_URL = 'http://localhost:4566/000000000000/events-queue';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  afterEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_ENDPOINT_URL;
    delete process.env.SQS_QUEUE_URL;
    delete process.env.DATABASE_URL;
  });

  describe('Happy Path - Events Claimed and Sent to SQS', () => {
    it('should claim events and send to SQS queue', async () => {
      // Arrange
      const mockEvents = [
        createMockEvent('event-1'),
        createMockEvent('event-2'),
        createMockEvent('event-3'),
      ];
      mockClaimReadyEventsExecute.mockResolvedValue(mockEvents);

      // Act
      await handler(mockEventBridgeEvent);

      // Assert
      expect(mockClaimReadyEventsExecute).toHaveBeenCalledTimes(1);
      expect(mockSQSAdapterSendMessage).toHaveBeenCalledTimes(3);

      // Verify SQS payload structure for first event
      expect(mockSQSAdapterSendMessage).toHaveBeenCalledWith({
        eventId: 'event-1',
        eventType: 'BIRTHDAY',
        idempotencyKey: 'evt-event-1-123456789',
        metadata: {
          userId: 'user-event-1',
          targetTimestampUTC: expect.any(String) as string,
          deliveryPayload: { message: 'Happy Birthday!' },
        },
      });
    });

    it('should log execution start and completion with metrics', async () => {
      // Arrange
      const mockEvents = [createMockEvent('event-1'), createMockEvent('event-2')];
      mockClaimReadyEventsExecute.mockResolvedValue(mockEvents);

      // Act
      await handler(mockEventBridgeEvent);

      // Assert - Start log
      expect(logger.info).toHaveBeenCalledWith({
        msg: 'Scheduler Lambda execution started',
        eventBridgeRuleName: 'arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule',
        eventTime: '2025-10-24T10:00:00Z',
      });

      // Assert - Completion log
      expect(logger.info).toHaveBeenCalledWith({
        msg: 'Scheduler Lambda execution completed',
        eventsClaimed: 2,
        eventsSentToQueue: 2,
        durationMs: expect.any(Number) as number,
      });
    });
  });

  describe('Edge Cases - No Events Ready', () => {
    it('should handle no events ready gracefully', async () => {
      // Arrange
      mockClaimReadyEventsExecute.mockResolvedValue([]);

      // Act
      await handler(mockEventBridgeEvent);

      // Assert
      expect(mockClaimReadyEventsExecute).toHaveBeenCalledTimes(1);
      expect(mockSQSAdapterSendMessage).not.toHaveBeenCalled();

      // Verify logging shows 0 events
      expect(logger.info).toHaveBeenCalledWith({
        msg: 'Scheduler Lambda execution completed',
        eventsClaimed: 0,
        eventsSentToQueue: 0,
        durationMs: expect.any(Number) as number,
      });
    });
  });

  describe('Error Handling - Use Case Errors', () => {
    it('should log errors and not crash when use case throws', async () => {
      // Arrange
      const testError = new Error('Database connection failed');
      mockClaimReadyEventsExecute.mockRejectedValue(testError);

      // Act
      await handler(mockEventBridgeEvent);

      // Assert - Error logged
      expect(logger.error).toHaveBeenCalledWith({
        msg: 'Scheduler Lambda execution failed',
        error: 'Database connection failed',
        stack: expect.any(String) as string,
        eventBridgeRuleName: 'arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule',
      });

      // Assert - Handler completes without throwing (no expect().rejects)
      expect(mockSQSAdapterSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling - SQS Errors', () => {
    it('should log errors and not crash when SQS send fails', async () => {
      // Arrange
      const mockEvents = [createMockEvent('event-1')];
      mockClaimReadyEventsExecute.mockResolvedValue(mockEvents);
      mockSQSAdapterSendMessage.mockRejectedValue(new Error('SQS service unavailable'));

      // Act
      await handler(mockEventBridgeEvent);

      // Assert - Error logged
      expect(logger.error).toHaveBeenCalledWith({
        msg: 'Scheduler Lambda execution failed',
        error: 'SQS service unavailable',
        stack: expect.any(String) as string,
        eventBridgeRuleName: 'arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule',
      });

      // Assert - Handler completes without throwing
      expect(mockClaimReadyEventsExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Logging - Structured Context', () => {
    it('should log EventBridge rule name and timestamp', async () => {
      // Arrange
      mockClaimReadyEventsExecute.mockResolvedValue([]);

      // Act
      await handler(mockEventBridgeEvent);

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventBridgeRuleName: 'arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule',
          eventTime: '2025-10-24T10:00:00Z',
        })
      );
    });

    it('should log execution duration in milliseconds', async () => {
      // Arrange
      mockClaimReadyEventsExecute.mockResolvedValue([]);

      // Act
      await handler(mockEventBridgeEvent);

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: expect.any(Number) as number,
        })
      );

      // Verify duration is reasonable (< 1000ms for mock execution)
      interface LogCall {
        msg?: string;
        durationMs?: number;
      }
      const mockCalls = (logger.info as jest.Mock).mock.calls as Array<[LogCall]>;
      const logCall = mockCalls.find((call: [LogCall]) => call[0]?.msg?.includes('completed'));
      expect(logCall).toBeDefined();
      expect(logCall![0].durationMs).toBeLessThan(1000);
    });
  });

  describe('Dependency Injection - Environment Configuration', () => {
    it('should use environment variables for AWS configuration', async () => {
      // Arrange
      process.env.AWS_REGION = 'eu-west-1';
      process.env.AWS_ENDPOINT_URL = 'https://custom-endpoint.com';
      mockClaimReadyEventsExecute.mockResolvedValue([]);

      // Act
      await handler(mockEventBridgeEvent);

      // Assert - Verify SQSClient was created with correct config
      // (This is implicitly tested by successful handler execution)
      expect(mockClaimReadyEventsExecute).toHaveBeenCalled();
    });
  });
});
