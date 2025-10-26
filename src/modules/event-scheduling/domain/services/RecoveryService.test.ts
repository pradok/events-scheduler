import { RecoveryService, type RecoveryResult, type ILogger } from './RecoveryService';
import type { IEventRepository } from '../../application/ports/IEventRepository';
import type { Event } from '../entities/Event';
import { DateTime } from 'luxon';

describe('RecoveryService', () => {
  let service: RecoveryService;
  let mockEventRepo: jest.Mocked<IEventRepository>;
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

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    service = new RecoveryService(mockEventRepo, mockLogger);
  });

  describe('execute', () => {
    it('should return zero count when no missed events exist', async () => {
      // Arrange
      mockEventRepo.findMissedEvents.mockResolvedValue([]);

      // Act
      const result: RecoveryResult = await service.execute();

      // Assert
      expect(result.missedEventsCount).toBe(0);
      expect(result.oldestEventTimestamp).toBeNull();
      expect(result.newestEventTimestamp).toBeNull();
      expect(mockEventRepo.findMissedEvents).toHaveBeenCalledWith(1000);
      expect(mockLogger.info).toHaveBeenCalledWith('No missed events found');
    });

    it('should detect and log missed events with correct timestamps', async () => {
      // Arrange
      const oldestTimestamp = DateTime.now().minus({ days: 7 });
      const newestTimestamp = DateTime.now().minus({ hours: 1 });

      const mockEvents: Partial<Event>[] = [
        { id: 'event-1', targetTimestampUTC: oldestTimestamp } as Event,
        { id: 'event-2', targetTimestampUTC: DateTime.now().minus({ days: 3 }) } as Event,
        { id: 'event-3', targetTimestampUTC: newestTimestamp } as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);

      // Act
      const result: RecoveryResult = await service.execute();

      // Assert
      expect(result.missedEventsCount).toBe(3);
      expect(result.oldestEventTimestamp).toEqual(oldestTimestamp);
      expect(result.newestEventTimestamp).toEqual(newestTimestamp);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Missed events found',
          count: 3,
          oldestEventTimestamp: oldestTimestamp.toISO(),
          newestEventTimestamp: newestTimestamp.toISO(),
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
        { id: 'event-1', targetTimestampUTC: oneHourAgo } as Event,
      ];
      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents1Hour as Event[]);

      // Act
      const result1Hour = await service.execute();

      // Assert
      expect(result1Hour.missedEventsCount).toBe(1);
      expect(result1Hour.oldestEventTimestamp).toEqual(oneHourAgo);

      // Arrange - 1 day downtime
      const oneDayAgo = DateTime.now().minus({ days: 1 });
      const mockEvents1Day: Partial<Event>[] = [
        { id: 'event-2', targetTimestampUTC: oneDayAgo } as Event,
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
        { id: 'event-3', targetTimestampUTC: oneWeekAgo } as Event,
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
        { id: 'event-1', targetTimestampUTC: oldestTimestamp } as Event,
        { id: 'event-2', targetTimestampUTC: middleTimestamp } as Event,
        { id: 'event-3', targetTimestampUTC: newestTimestamp } as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);

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
        { id: 'event-1', targetTimestampUTC: oldestTimestamp } as Event,
        { id: 'event-2', targetTimestampUTC: newestTimestamp } as Event,
      ];

      mockEventRepo.findMissedEvents.mockResolvedValue(mockEvents as Event[]);

      // Act
      await service.execute();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Missed events found',
          count: 2,
          oldestEventTimestamp: oldestTimestamp.toISO(),
          newestEventTimestamp: newestTimestamp.toISO(),
        })
      );
    });
  });
});
