import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { RescheduleEventsOnUserBirthdayChangedHandler } from './RescheduleEventsOnUserBirthdayChangedHandler';
import { UserBirthdayChangedEvent } from '../../../user/domain/events/UserBirthdayChanged';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { BirthdayEventHandler } from '../../domain/services/event-handlers/BirthdayEventHandler';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { RescheduleBirthdayEventsUseCase } from '../use-cases/RescheduleBirthdayEventsUseCase';
import { logger } from '../../../../shared/logger';

describe('RescheduleEventsOnUserBirthdayChangedHandler', () => {
  let handler: RescheduleEventsOnUserBirthdayChangedHandler;
  let rescheduleBirthdayEventsUseCase: RescheduleBirthdayEventsUseCase;
  let mockEventRepository: jest.Mocked<IEventRepository>;
  let timezoneService: TimezoneService;
  let eventHandlerRegistry: EventHandlerRegistry;

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

    // Real timezone service and registry
    timezoneService = new TimezoneService();
    eventHandlerRegistry = new EventHandlerRegistry();
    eventHandlerRegistry.register(new BirthdayEventHandler());

    // Create use case
    rescheduleBirthdayEventsUseCase = new RescheduleBirthdayEventsUseCase(
      mockEventRepository,
      timezoneService,
      eventHandlerRegistry
    );

    // Create handler (thin adapter)
    handler = new RescheduleEventsOnUserBirthdayChangedHandler(rescheduleBirthdayEventsUseCase);
  });

  function createUserBirthdayChangedEvent(
    overrides: Partial<UserBirthdayChangedEvent> = {}
  ): UserBirthdayChangedEvent {
    return {
      eventType: 'UserBirthdayChanged',
      context: 'user',
      occurredAt: DateTime.now().toISO(),
      aggregateId: 'user-123',
      userId: 'user-123',
      oldDateOfBirth: '1990-01-15',
      newDateOfBirth: '1990-02-14',
      timezone: 'America/New_York',
      ...overrides,
    };
  }

  function createPendingBirthdayEvent(userId: string): Event {
    const targetTimestampUTC = DateTime.now().plus({ days: 30 });
    return new Event({
      id: randomUUID(),
      userId,
      eventType: 'BIRTHDAY',
      status: EventStatus.PENDING,
      targetTimestampUTC,
      targetTimestampLocal: targetTimestampUTC,
      targetTimezone: 'America/New_York',
      idempotencyKey: IdempotencyKey.generate(userId, targetTimestampUTC),
      deliveryPayload: { message: 'Happy Birthday!' },
      version: 1,
      retryCount: 0,
      executedAt: null,
      failureReason: null,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });
  }

  function createCompletedBirthdayEvent(userId: string): Event {
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
      deliveryPayload: { message: 'Happy Birthday!' },
      version: 1,
      retryCount: 0,
      executedAt: DateTime.now().minus({ hours: 1 }),
      failureReason: null,
      createdAt: DateTime.now().minus({ days: 2 }),
      updatedAt: DateTime.now().minus({ hours: 1 }),
    });
  }

  describe('handle()', () => {
    it('should reschedule PENDING birthday events when birthday changed', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      const pendingEvent = createPendingBirthdayEvent(event.userId);
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
      expect(rescheduledEvent.targetTimezone).toBe('America/New_York');
    });

    it('should NOT modify COMPLETED events', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      const completedEvent = createCompletedBirthdayEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([completedEvent]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.findByUserId).toHaveBeenCalledWith(event.userId); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventRepository.update).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should handle Feb 29 birthday edge case', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent({
        oldDateOfBirth: '1990-01-15',
        newDateOfBirth: '1992-02-29', // Leap year birthday
        timezone: 'UTC',
      });
      const pendingEvent = createPendingBirthdayEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method

      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent).toBeDefined();

      // In non-leap years, birthday should be Feb 28
      const isLeapYear = rescheduledEvent.targetTimestampLocal.year % 4 === 0;
      if (isLeapYear) {
        expect(rescheduledEvent.targetTimestampLocal.month).toBe(2);
        expect(rescheduledEvent.targetTimestampLocal.day).toBe(29);
      } else {
        expect(rescheduledEvent.targetTimestampLocal.month).toBe(2);
        expect(rescheduledEvent.targetTimestampLocal.day).toBe(28);
      }
    });

    it('should reschedule multiple PENDING birthday events', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      const pendingEvent1 = createPendingBirthdayEvent(event.userId);
      const pendingEvent2 = createPendingBirthdayEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent1, pendingEvent2]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.update).toHaveBeenCalledTimes(2); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should do nothing when user has no events', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      mockEventRepository.findByUserId.mockResolvedValue([]);

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.findByUserId).toHaveBeenCalledWith(event.userId); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventRepository.update).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should only reschedule PENDING events, ignoring PROCESSING/COMPLETED/FAILED', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      const pendingEvent = createPendingBirthdayEvent(event.userId);
      const completedEvent = createCompletedBirthdayEvent(event.userId);

      const pendingForProcessing = createPendingBirthdayEvent(event.userId);
      const processingEvent = pendingForProcessing.claim();

      // Create a failed event properly by going through state transitions
      const pendingForFailed = createPendingBirthdayEvent(event.userId);
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

    it('should calculate new birthday correctly for different timezones', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent({
        newDateOfBirth: '1990-03-15',
        timezone: 'Europe/London',
      });
      const pendingEvent = createPendingBirthdayEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent).toBeDefined();

      // Birthday is March 15 at 9:00 AM London time
      expect(rescheduledEvent.targetTimestampLocal.hour).toBe(9);
      expect(rescheduledEvent.targetTimestampLocal.minute).toBe(0);
      expect(rescheduledEvent.targetTimestampLocal.month).toBe(3);
      expect(rescheduledEvent.targetTimestampLocal.day).toBe(15);
      expect(rescheduledEvent.targetTimezone).toBe('Europe/London');
    });

    it('should throw error if dateOfBirth is invalid', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent({
        newDateOfBirth: 'invalid-date',
      });
      const pendingEvent = createPendingBirthdayEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow();
    });

    it('should throw error if timezone is invalid', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent({
        timezone: 'Invalid/Timezone',
      });
      const pendingEvent = createPendingBirthdayEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow();
    });

    it('should log error and rethrow if update fails', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      const pendingEvent = createPendingBirthdayEvent(event.userId);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);
      mockEventRepository.update.mockRejectedValue(new Error('Database error'));
      const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation();

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow('Database error');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Failed to reschedule birthday events from UserBirthdayChanged event',
          eventType: 'UserBirthdayChanged',
          userId: 'user-123',
          aggregateId: 'user-123',
          error: 'Database error',
        })
      );

      loggerErrorSpy.mockRestore();
    });

    it('should increment version for each rescheduled event', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      const pendingEvent = createPendingBirthdayEvent(event.userId);
      const originalVersion = pendingEvent.version;
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      await handler.handle(event);

      // Assert
      const rescheduledEvent = mockEventRepository.update.mock.calls[0]?.[0] as Event;
      expect(rescheduledEvent.version).toBe(originalVersion + 1);
    });

    it('should NOT reschedule non-BIRTHDAY events', async () => {
      // Arrange
      const event = createUserBirthdayChangedEvent();
      const anniversaryEvent = createPendingBirthdayEvent(event.userId);
      // Hack to change event type (readonly in normal usage)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (anniversaryEvent as any).eventType = 'ANNIVERSARY';

      mockEventRepository.findByUserId.mockResolvedValue([anniversaryEvent]);

      // Act
      await handler.handle(event);

      // Assert
      // Anniversary events should NOT be rescheduled when birthday changes
      expect(mockEventRepository.update).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });
  });
});
