import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { RescheduleEventsOnUserTimezoneChangedHandler } from './RescheduleEventsOnUserTimezoneChangedHandler';
import { UserTimezoneChangedEvent } from '../../../user/domain/events/UserTimezoneChanged';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { RescheduleEventsOnTimezoneChangeUseCase } from '../use-cases/RescheduleEventsOnTimezoneChangeUseCase';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { logger } from '../../../../shared/logger';

describe('RescheduleEventsOnUserTimezoneChangedHandler', () => {
  let handler: RescheduleEventsOnUserTimezoneChangedHandler;
  let mockEventRepository: jest.Mocked<IEventRepository>;
  let timezoneService: TimezoneService;
  let rescheduleEventsOnTimezoneChangeUseCase: RescheduleEventsOnTimezoneChangeUseCase;

  beforeEach(() => {
    // Mock event repository
    mockEventRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      claimReadyEvents: jest.fn(),
      deleteByUserId: jest.fn(),
      findMissedEvents: jest.fn(),
    } as jest.Mocked<IEventRepository>;

    // Real timezone service
    timezoneService = new TimezoneService();

    // Create use case
    rescheduleEventsOnTimezoneChangeUseCase = new RescheduleEventsOnTimezoneChangeUseCase(
      mockEventRepository,
      timezoneService
    );

    // Create handler (thin adapter)
    handler = new RescheduleEventsOnUserTimezoneChangedHandler(
      rescheduleEventsOnTimezoneChangeUseCase
    );
  });

  function createUserTimezoneChangedEvent(
    overrides: Partial<UserTimezoneChangedEvent> = {}
  ): UserTimezoneChangedEvent {
    return {
      eventType: 'UserTimezoneChanged',
      context: 'user',
      occurredAt: DateTime.now().toISO(),
      aggregateId: 'user-123',
      userId: 'user-123',
      oldTimezone: 'America/New_York',
      newTimezone: 'America/Los_Angeles',
      dateOfBirth: '1990-01-15',
      ...overrides,
    };
  }

  function createPendingEvent(userId: string, eventType: string = 'BIRTHDAY'): Event {
    // Create event at 9:00 AM in New York timezone
    const targetTimestampLocal = DateTime.now().plus({ days: 30 }).set({ hour: 9, minute: 0 });
    const targetTimestampUTC = DateTime.now().plus({ days: 30 }).set({ hour: 14, minute: 0 }); // 9 AM EST = 2 PM UTC

    return new Event({
      id: randomUUID(),
      userId,
      eventType,
      status: EventStatus.PENDING,
      targetTimestampUTC,
      targetTimestampLocal,
      targetTimezone: 'America/New_York',
      idempotencyKey: IdempotencyKey.generate(userId, targetTimestampUTC),
      deliveryPayload: { message: 'Test message' },
      version: 1,
      retryCount: 0,
      executedAt: null,
      failureReason: null,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });
  }

  function createCompletedEvent(userId: string): Event {
    const targetTimestampUTC = DateTime.now().minus({ days: 1 });
    return new Event({
      id: randomUUID(),
      userId,
      eventType: 'BIRTHDAY',
      status: EventStatus.COMPLETED,
      targetTimestampUTC,
      targetTimestampLocal: targetTimestampUTC,
      targetTimezone: 'America/New_York',
      idempotencyKey: IdempotencyKey.generate(userId, targetTimestampUTC),
      deliveryPayload: { message: 'Test message' },
      version: 1,
      retryCount: 0,
      executedAt: DateTime.now().minus({ hours: 1 }),
      failureReason: null,
      createdAt: DateTime.now().minus({ days: 2 }),
      updatedAt: DateTime.now().minus({ hours: 1 }),
    });
  }

  describe('handle()', () => {
    it('should recalculate UTC times for PENDING events', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const pendingEvent = createPendingEvent(event.userId);
      const originalLocalTime = pendingEvent.targetTimestampLocal;
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.findByUserId).toHaveBeenCalledWith(event.userId); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method

      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent).toBeDefined();
      expect(rescheduledEvent.eventType).toBe('BIRTHDAY');
      expect(rescheduledEvent.status).toBe(EventStatus.PENDING);
      expect(rescheduledEvent.version).toBe(pendingEvent.version + 1);
      expect(rescheduledEvent.targetTimezone).toBe('America/Los_Angeles');

      // Local time should be unchanged (9:00 AM)
      expect(rescheduledEvent.targetTimestampLocal.toISO()).toBe(originalLocalTime.toISO());
      expect(rescheduledEvent.targetTimestampLocal.hour).toBe(9);

      // UTC time should be recalculated (9 AM PST = 5 PM UTC, vs 9 AM EST = 2 PM UTC)
      expect(rescheduledEvent.targetTimestampUTC).not.toEqual(pendingEvent.targetTimestampUTC);
    });

    it('should maintain local time (9:00 AM)', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const pendingEvent = createPendingEvent(event.userId);
      const originalLocalTime = pendingEvent.targetTimestampLocal;
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent).toBeDefined();

      // Local time should remain exactly the same
      expect(rescheduledEvent.targetTimestampLocal.toISO()).toBe(originalLocalTime.toISO());
      expect(rescheduledEvent.targetTimestampLocal.hour).toBe(originalLocalTime.hour);
      expect(rescheduledEvent.targetTimestampLocal.minute).toBe(originalLocalTime.minute);
    });

    it('should NOT modify COMPLETED events', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const completedEvent = createCompletedEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([completedEvent]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.findByUserId).toHaveBeenCalledWith(event.userId); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventRepository.update).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should reschedule all event types (not just birthdays)', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const birthdayEvent = createPendingEvent(event.userId, 'BIRTHDAY');
      const anniversaryEvent = createPendingEvent(event.userId, 'ANNIVERSARY');
      mockEventRepository.findByUserId.mockResolvedValue([birthdayEvent, anniversaryEvent]);

      // Act
      await handler.handle(event);

      // Assert
      // Both birthday and anniversary events should be rescheduled
      expect(mockEventRepository.update).toHaveBeenCalledTimes(2); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should do nothing when user has no events', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      mockEventRepository.findByUserId.mockResolvedValue([]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.findByUserId).toHaveBeenCalledWith(event.userId); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventRepository.update).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should only reschedule PENDING events, ignoring PROCESSING/COMPLETED/FAILED', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const pendingEvent = createPendingEvent(event.userId);
      const completedEvent = createCompletedEvent(event.userId);

      const pendingForProcessing = createPendingEvent(event.userId);
      const processingEvent = pendingForProcessing.claim();

      // Create a failed event properly by going through state transitions
      const pendingForFailed = createPendingEvent(event.userId);
      const processingForFailed = pendingForFailed.claim();
      const failedEvent = processingForFailed.markFailed('Test failure');

      mockEventRepository.findByUserId.mockResolvedValue([
        pendingEvent,
        completedEvent,
        processingEvent,
        failedEvent,
      ]);

      // Act
      await handler.handle(event);

      // Assert
      // Only PENDING event should be rescheduled
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method

      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent.id).toBe(pendingEvent.id);
    });

    it('should handle timezone with DST correctly', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent({
        oldTimezone: 'America/New_York',
        newTimezone: 'America/Phoenix', // Arizona doesn't observe DST
      });
      const pendingEvent = createPendingEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent).toBeDefined();

      // TimezoneService should handle DST correctly
      expect(rescheduledEvent.targetTimestampLocal.hour).toBe(9);
      expect(rescheduledEvent.targetTimezone).toBe('America/Phoenix');
    });

    it('should throw error if timezone is invalid', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent({
        newTimezone: 'Invalid/Timezone',
      });
      const pendingEvent = createPendingEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow();
    });

    it('should log error and rethrow if update fails', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const pendingEvent = createPendingEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);
      mockEventRepository.update.mockRejectedValue(new Error('Database error'));
      const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation();

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow('Database error');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Failed to reschedule events from UserTimezoneChanged event',
          eventType: 'UserTimezoneChanged',
          userId: 'user-123',
          aggregateId: 'user-123',
          error: 'Database error',
        })
      );

      loggerErrorSpy.mockRestore();
    });

    it('should increment version for each rescheduled event', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const pendingEvent = createPendingEvent(event.userId);
      const originalVersion = pendingEvent.version;
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent.version).toBe(originalVersion + 1);
    });

    it('should handle timezone change across date line', async () => {
      // Arrange - Change from US to Asia (crosses date line)
      const event = createUserTimezoneChangedEvent({
        oldTimezone: 'America/New_York',
        newTimezone: 'Asia/Tokyo',
      });
      const pendingEvent = createPendingEvent(event.userId);
      const originalLocalTime = pendingEvent.targetTimestampLocal;
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent).toBeDefined();

      // Local time stays the same (9 AM)
      expect(rescheduledEvent.targetTimestampLocal.hour).toBe(originalLocalTime.hour);

      // UTC time changes dramatically (Tokyo is +9 hours from UTC)
      expect(rescheduledEvent.targetTimezone).toBe('Asia/Tokyo');
      expect(rescheduledEvent.targetTimestampUTC).not.toEqual(pendingEvent.targetTimestampUTC);
    });

    it('should reschedule multiple PENDING events', async () => {
      // Arrange
      const event = createUserTimezoneChangedEvent();
      const pendingEvent1 = createPendingEvent(event.userId);
      const pendingEvent2 = createPendingEvent(event.userId, 'ANNIVERSARY');
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent1, pendingEvent2]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.update).toHaveBeenCalledTimes(2); // eslint-disable-line @typescript-eslint/unbound-method

      // Both events should have updated timezones
      const rescheduledEvent1 = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      const rescheduledEvent2 = mockEventRepository.update.mock.calls[1]?.[0] as Event;
      expect(rescheduledEvent1.targetTimezone).toBe('America/Los_Angeles');
      expect(rescheduledEvent2.targetTimezone).toBe('America/Los_Angeles');
    });
  });
});
