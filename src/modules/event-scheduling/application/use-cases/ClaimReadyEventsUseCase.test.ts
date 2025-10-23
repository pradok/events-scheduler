import { ClaimReadyEventsUseCase } from './ClaimReadyEventsUseCase';
import { IEventRepository } from '../ports/IEventRepository';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { DateTime } from 'luxon';
import { logger } from '../../../../shared/logger';

// Mock the logger
jest.mock('../../../../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ClaimReadyEventsUseCase', () => {
  let useCase: ClaimReadyEventsUseCase;
  let mockEventRepository: jest.Mocked<IEventRepository>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock repository
    mockEventRepository = {
      claimReadyEvents: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      deleteByUserId: jest.fn(),
    };

    // Create use case with mocked repository
    useCase = new ClaimReadyEventsUseCase(mockEventRepository);
  });

  describe('execute', () => {
    it('should claim ready events from repository', async () => {
      // Arrange
      const mockEvents = [
        createMockEvent('event-1'),
        createMockEvent('event-2'),
        createMockEvent('event-3'),
      ];
      mockEventRepository.claimReadyEvents.mockResolvedValue(mockEvents);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(result).toEqual(mockEvents);
      expect(result).toHaveLength(3);
      expect(mockEventRepository.claimReadyEvents).toHaveBeenCalledWith(100);
      expect(mockEventRepository.claimReadyEvents).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no events ready', async () => {
      // Arrange
      mockEventRepository.claimReadyEvents.mockResolvedValue([]);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(mockEventRepository.claimReadyEvents).toHaveBeenCalledWith(100);
    });

    it('should respect limit parameter of 100 events', async () => {
      // Arrange
      const mockEvents = Array.from({ length: 100 }, (_, i) => createMockEvent(`event-${i}`));
      mockEventRepository.claimReadyEvents.mockResolvedValue(mockEvents);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(result).toHaveLength(100);
      expect(mockEventRepository.claimReadyEvents).toHaveBeenCalledWith(100);
    });

    it('should log start of execution', async () => {
      // Arrange
      mockEventRepository.claimReadyEvents.mockResolvedValue([]);

      // Act
      await useCase.execute();

      // Assert
      expect(logger.info).toHaveBeenCalledWith('ClaimReadyEvents execution started');
    });

    it('should log successful execution with event count and duration', async () => {
      // Arrange
      const mockEvents = [createMockEvent('event-1'), createMockEvent('event-2')];
      mockEventRepository.claimReadyEvents.mockResolvedValue(mockEvents);

      // Act
      await useCase.execute();

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'ClaimReadyEvents execution completed',
          eventsClaimed: 2,
          durationMs: expect.any(Number) as number,
        })
      );
    });

    it('should log execution completion with 0 events when none ready', async () => {
      // Arrange
      mockEventRepository.claimReadyEvents.mockResolvedValue([]);

      // Act
      await useCase.execute();

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'ClaimReadyEvents execution completed',
          eventsClaimed: 0,
          durationMs: expect.any(Number) as number,
        })
      );
    });

    it('should rethrow repository errors', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      mockEventRepository.claimReadyEvents.mockRejectedValue(error);

      // Act & Assert
      await expect(useCase.execute()).rejects.toThrow('Database connection failed');
      expect(mockEventRepository.claimReadyEvents).toHaveBeenCalledWith(100);
    });

    it('should log error with structured context before rethrowing', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      mockEventRepository.claimReadyEvents.mockRejectedValue(error);

      // Act
      try {
        await useCase.execute();
      } catch (e) {
        // Expected to throw
      }

      // Assert
      expect(logger.error).toHaveBeenCalledWith({
        msg: 'ClaimReadyEvents execution failed',
        error: 'Database connection failed',
        stack: expect.any(String) as string,
      });
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      const error = 'String error message';
      mockEventRepository.claimReadyEvents.mockRejectedValue(error);

      // Act
      try {
        await useCase.execute();
      } catch (e) {
        // Expected to throw
      }

      // Assert
      expect(logger.error).toHaveBeenCalledWith({
        msg: 'ClaimReadyEvents execution failed',
        error: 'String error message',
        stack: undefined,
      });
    });

    it('should log info for start and completion (not error)', async () => {
      // Arrange
      mockEventRepository.claimReadyEvents.mockResolvedValue([createMockEvent('event-1')]);

      // Act
      await useCase.execute();

      // Assert
      expect(logger.info).toHaveBeenCalledTimes(2); // Start + completion
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});

/**
 * Helper function to create mock Event entities for testing.
 */
function createMockEvent(id: string): Event {
  const targetTimestamp = DateTime.now().minus({ minutes: 5 });
  const userId = 'user-123';

  return new Event({
    id,
    userId,
    eventType: 'BIRTHDAY',
    status: EventStatus.PROCESSING,
    targetTimestampUTC: targetTimestamp,
    targetTimestampLocal: targetTimestamp,
    targetTimezone: 'America/New_York',
    executedAt: null,
    failureReason: null,
    retryCount: 0,
    version: 2,
    idempotencyKey: IdempotencyKey.generate(userId, targetTimestamp),
    deliveryPayload: { message: 'Test message' },
    createdAt: DateTime.now().minus({ days: 1 }),
    updatedAt: DateTime.now(),
  });
}
