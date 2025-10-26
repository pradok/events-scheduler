import { RecoveryService, type RecoveryResult, type ILogger } from './RecoveryService';
import type { IEventRepository } from '../../application/ports/IEventRepository';
import type { ISQSClient } from '../../application/ports/ISQSClient';
import type { Event } from '../entities/Event';
import { IdempotencyKey } from '../value-objects/IdempotencyKey';
import { DateTime } from 'luxon';

describe('RecoveryService', () => {
  let service: RecoveryService;
  let mockEventRepo: jest.Mocked<IEventRepository>;
  let mockSQSClient: jest.Mocked<ISQSClient>;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockEventRepo = {
      findMissedEvents: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      claimReadyEvents: jest.fn(),
      deleteByUserId: jest.fn(),
    } as jest.Mocked<IEventRepository>;

    mockSQSClient = {
      sendMessage: jest.fn(),
    } as jest.Mocked<ISQSClient>;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    service = new RecoveryService(mockEventRepo, mockSQSClient, mockLogger);
  });

  describe('execute', () => {
    it('should return zero count when no missed events exist', async () => {
      // Arrange
      mockEventRepo.findMissedEvents.mockResolvedValue([]);

      // Act
      const result: RecoveryResult = await service.execute();

      // Assert
      expect(result.missedEventsCount).toBe(0);
      expect(result.eventsQueued).toBe(0);
      expect(result.eventsFailed).toBe(0);
      expect(result.oldestEventTimestamp).toBeNull();
      expect(result.newestEventTimestamp).toBeNull();
      expect(mockEventRepo.findMissedEvents).toHaveBeenCalledWith(1000);
      expect(mockLogger.info).toHaveBeenCalledWith('No missed events found');
      expect(mockSQSClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should detect and send missed events to SQS', async () => {
      // Arrange
      const oldestTimestamp = DateTime.now().minus({ days: 7 });
      const newestTimestamp = DateTime.now().minus({ hours: 1 });

      const mockEvents: Event[] = [
        {
          id: 'event-1',
          userId: 'user-1',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: oldestTimestamp,
          idempotencyKey: IdempotencyKey.fromString('key-1'),
          deliveryPayload: { message: 'Test 1' },
        } as unknown as Event,
        {
          id: 'event-2',
          userId: 'user-2',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: DateTime.now().minus({ days: 3 }),
          idempotencyKey: IdempotencyKey.fromString('key-2'),
          deliveryPayload: { message: 'Test 2' },
        } as unknown as Event,
        {
          id: 'event-3',
          userId: 'user-3',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: newestTimestamp,
          idempotencyKey: IdempotencyKey.fromString('key-3'),
          deliveryPayload: { message: 'Test 3' },
        } as unknown as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents);
      mockSQSClient.sendMessage.mockResolvedValue('message-id');

      // Act
      const result: RecoveryResult = await service.execute();

      // Assert
      expect(result.missedEventsCount).toBe(3);
      expect(result.eventsQueued).toBe(3);
      expect(result.eventsFailed).toBe(0);
      expect(result.oldestEventTimestamp).toEqual(oldestTimestamp);
      expect(result.newestEventTimestamp).toEqual(newestTimestamp);
      expect(mockSQSClient.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Recovery complete',
          eventsQueued: 3,
          eventsFailed: 0,
        })
      );
    });

    it('should respect batch limit of 1000 events', async () => {
      // Arrange
      mockEventRepo.findMissedEvents.mockResolvedValue([]);

      // Act
      await service.execute();

      // Assert
      expect(mockEventRepo.findMissedEvents).toHaveBeenCalledWith(1000);
    });

    it('should handle various downtime scenarios (1 hour, 1 day, 1 week)', async () => {
      // Arrange - 1 hour downtime
      const oneHourAgo = DateTime.now().minus({ hours: 1 });
      const mockEvents1Hour: Partial<Event>[] = [
        {
          id: 'event-1',
          userId: 'user-1',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: oneHourAgo,
          idempotencyKey: IdempotencyKey.fromString('key-1'),
          deliveryPayload: { message: 'Test' },
        } as unknown as Event,
      ];
      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents1Hour as Event[]);
      mockSQSClient.sendMessage.mockResolvedValue('message-id');

      // Act
      const result1Hour = await service.execute();

      // Assert
      expect(result1Hour.missedEventsCount).toBe(1);
      expect(result1Hour.oldestEventTimestamp).toEqual(oneHourAgo);

      // Arrange - 1 day downtime
      const oneDayAgo = DateTime.now().minus({ days: 1 });
      const mockEvents1Day: Partial<Event>[] = [
        {
          id: 'event-2',
          userId: 'user-2',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: oneDayAgo,
          idempotencyKey: IdempotencyKey.fromString('key-2'),
          deliveryPayload: { message: 'Test' },
        } as unknown as Event,
      ];
      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents1Day as Event[]);

      // Act
      const result1Day = await service.execute();

      // Assert
      expect(result1Day.missedEventsCount).toBe(1);
      expect(result1Day.oldestEventTimestamp).toEqual(oneDayAgo);

      // Arrange - 1 week downtime
      const oneWeekAgo = DateTime.now().minus({ weeks: 1 });
      const mockEvents1Week: Partial<Event>[] = [
        {
          id: 'event-3',
          userId: 'user-3',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: oneWeekAgo,
          idempotencyKey: IdempotencyKey.fromString('key-3'),
          deliveryPayload: { message: 'Test' },
        } as unknown as Event,
      ];
      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents1Week as Event[]);

      // Act
      const result1Week = await service.execute();

      // Assert
      expect(result1Week.missedEventsCount).toBe(1);
      expect(result1Week.oldestEventTimestamp).toEqual(oneWeekAgo);
    });

    it('should return events ordered by targetTimestampUTC ASC', async () => {
      // Arrange - Events already ordered by repository (oldest first)
      const oldestTimestamp = DateTime.now().minus({ days: 7 });
      const middleTimestamp = DateTime.now().minus({ days: 3 });
      const newestTimestamp = DateTime.now().minus({ hours: 1 });

      const mockEvents: Partial<Event>[] = [
        {
          id: 'event-1',
          userId: 'user-1',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: oldestTimestamp,
          idempotencyKey: IdempotencyKey.fromString('key-1'),
          deliveryPayload: { message: 'Test 1' },
        } as unknown as Event,
        {
          id: 'event-2',
          userId: 'user-2',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: middleTimestamp,
          idempotencyKey: IdempotencyKey.fromString('key-2'),
          deliveryPayload: { message: 'Test 2' },
        } as unknown as Event,
        {
          id: 'event-3',
          userId: 'user-3',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: newestTimestamp,
          idempotencyKey: IdempotencyKey.fromString('key-3'),
          deliveryPayload: { message: 'Test 3' },
        } as unknown as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);
      mockSQSClient.sendMessage.mockResolvedValue('message-id');

      // Act
      const result: RecoveryResult = await service.execute();

      // Assert
      expect(result.oldestEventTimestamp).toEqual(oldestTimestamp);
      expect(result.newestEventTimestamp).toEqual(newestTimestamp);
      // Verify order is maintained (oldest is index 0, newest is last)
      // Use DateTime comparison method
      expect(oldestTimestamp < newestTimestamp).toBe(true);
    });

    it('should log oldest and newest event timestamps', async () => {
      // Arrange
      const oldestTimestamp = DateTime.now().minus({ days: 5 });
      const newestTimestamp = DateTime.now().minus({ hours: 2 });

      const mockEvents: Partial<Event>[] = [
        {
          id: 'event-1',
          userId: 'user-1',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: oldestTimestamp,
          idempotencyKey: IdempotencyKey.fromString('key-1'),
          deliveryPayload: { message: 'Test 1' },
        } as unknown as Event,
        {
          id: 'event-2',
          userId: 'user-2',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: newestTimestamp,
          idempotencyKey: IdempotencyKey.fromString('key-2'),
          deliveryPayload: { message: 'Test 2' },
        } as unknown as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);
      mockSQSClient.sendMessage.mockResolvedValue('message-id');

      // Act
      await service.execute();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Recovery complete',
          eventsQueued: 2,
          eventsFailed: 0,
        })
      );
    });
  });

  describe('SQS Integration (Story 3.2)', () => {
    it('should send correct payload structure to SQS', async () => {
      // Arrange
      const targetTimestamp = DateTime.now().minus({ hours: 1 });
      const mockEvents: Partial<Event>[] = [
        {
          id: 'event-123',
          userId: 'user-456',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: targetTimestamp,
          idempotencyKey: IdempotencyKey.fromString('idempotency-key-789'),
          deliveryPayload: { message: 'Happy Birthday!' },
        } as unknown as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);
      mockSQSClient.sendMessage.mockResolvedValue('message-id-123');

      // Act
      await service.execute();

      // Assert
      expect(mockSQSClient.sendMessage).toHaveBeenCalledWith({
        eventId: 'event-123',
        eventType: 'BIRTHDAY',
        idempotencyKey: 'idempotency-key-789',
        metadata: {
          userId: 'user-456',
          targetTimestampUTC: targetTimestamp.toISO(),
          deliveryPayload: { message: 'Happy Birthday!' },
        },
      });
    });

    it('should continue processing if one event fails to send to SQS', async () => {
      // Arrange
      const mockEvents: Partial<Event>[] = [
        {
          id: 'event-1',
          userId: 'user-1',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: DateTime.now().minus({ hours: 3 }),
          idempotencyKey: IdempotencyKey.fromString('key-1'),
          deliveryPayload: { message: 'Test 1' },
        } as unknown as Event,
        {
          id: 'event-2',
          userId: 'user-2',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: DateTime.now().minus({ hours: 2 }),
          idempotencyKey: IdempotencyKey.fromString('key-2'),
          deliveryPayload: { message: 'Test 2' },
        } as unknown as Event,
        {
          id: 'event-3',
          userId: 'user-3',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: DateTime.now().minus({ hours: 1 }),
          idempotencyKey: IdempotencyKey.fromString('key-3'),
          deliveryPayload: { message: 'Test 3' },
        } as unknown as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);

      // Mock sendMessage to succeed for events 1 and 3, fail for event 2
      mockSQSClient.sendMessage
        .mockResolvedValueOnce('message-id-1') // event-1 succeeds
        .mockRejectedValueOnce(new Error('Network timeout')) // event-2 fails
        .mockResolvedValueOnce('message-id-3'); // event-3 succeeds

      // Act
      const result = await service.execute();

      // Assert
      expect(result.missedEventsCount).toBe(3);
      expect(result.eventsQueued).toBe(2);
      expect(result.eventsFailed).toBe(1);
      expect(mockSQSClient.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Failed to queue event for recovery',
          eventId: 'event-2',
          error: 'Network timeout',
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Recovery complete',
          eventsQueued: 2,
          eventsFailed: 1,
        })
      );
    });

    it('should log completion with queued and failed counts', async () => {
      // Arrange
      const mockEvents: Partial<Event>[] = [
        {
          id: 'event-1',
          userId: 'user-1',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: DateTime.now().minus({ hours: 1 }),
          idempotencyKey: IdempotencyKey.fromString('key-1'),
          deliveryPayload: { message: 'Test 1' },
        } as unknown as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);
      mockSQSClient.sendMessage.mockResolvedValue('message-id');

      // Act
      await service.execute();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Recovery complete',
          eventsQueued: 1,
          eventsFailed: 0,
        })
      );
    });

    it('should handle all events failing to send to SQS', async () => {
      // Arrange
      const mockEvents: Partial<Event>[] = [
        {
          id: 'event-1',
          userId: 'user-1',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: DateTime.now().minus({ hours: 2 }),
          idempotencyKey: IdempotencyKey.fromString('key-1'),
          deliveryPayload: { message: 'Test 1' },
        } as unknown as Event,
        {
          id: 'event-2',
          userId: 'user-2',
          eventType: 'BIRTHDAY',
          targetTimestampUTC: DateTime.now().minus({ hours: 1 }),
          idempotencyKey: IdempotencyKey.fromString('key-2'),
          deliveryPayload: { message: 'Test 2' },
        } as unknown as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);
      mockSQSClient.sendMessage.mockRejectedValue(new Error('SQS unavailable'));

      // Act
      const result = await service.execute();

      // Assert
      expect(result.missedEventsCount).toBe(2);
      expect(result.eventsQueued).toBe(0);
      expect(result.eventsFailed).toBe(2);
      expect(mockLogger.error).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Recovery complete',
          eventsQueued: 0,
          eventsFailed: 2,
        })
      );
    });
  });
});
