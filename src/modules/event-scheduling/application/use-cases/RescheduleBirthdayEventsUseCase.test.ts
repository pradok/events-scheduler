import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { RescheduleBirthdayEventsUseCase } from './RescheduleBirthdayEventsUseCase';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { BirthdayEventHandler } from '../../domain/services/event-handlers/BirthdayEventHandler';
import { RescheduleBirthdayEventsDTO } from '../dtos/RescheduleBirthdayEventsDTO';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { ZodError } from 'zod';

describe('RescheduleBirthdayEventsUseCase', () => {
  let useCase: RescheduleBirthdayEventsUseCase;
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
    useCase = new RescheduleBirthdayEventsUseCase(
      mockEventRepository,
      timezoneService,
      eventHandlerRegistry
    );
  });

  function createMockEvent(overrides: Partial<Event> = {}): Event {
    const now = DateTime.now();
    const nextYear = now.plus({ years: 1 });

    return new Event({
      id: randomUUID(),
      userId: 'user-123',
      eventType: 'BIRTHDAY',
      status: EventStatus.PENDING,
      targetTimestampUTC: nextYear,
      targetTimestampLocal: nextYear.setZone('America/New_York'),
      targetTimezone: 'America/New_York',
      idempotencyKey: IdempotencyKey.generate('user-123', nextYear),
      deliveryPayload: { message: 'Test message' },
      version: 1,
      retryCount: 0,
      executedAt: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  }

  describe('execute()', () => {
    it('should reschedule PENDING birthday events', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-123',
        newDateOfBirth: '1990-02-20',
        timezone: 'America/New_York',
      };

      const pendingEvent = createMockEvent();
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);

      // Act
      const result = await useCase.execute(dto);

      // Assert - Rescheduled 1 event
      expect(result.rescheduledCount).toBe(1);
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should return count of rescheduled events', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-456',
        newDateOfBirth: '1995-06-15',
        timezone: 'Europe/London',
      };

      const event1 = createMockEvent({ userId: 'user-456' });
      const event2 = createMockEvent({ userId: 'user-456' });
      const event3 = createMockEvent({ userId: 'user-456' });
      mockEventRepository.findByUserId.mockResolvedValue([event1, event2, event3]);

      // Act
      const result = await useCase.execute(dto);

      // Assert
      expect(result.rescheduledCount).toBe(3);
      expect(mockEventRepository.update).toHaveBeenCalledTimes(3);
    });

    it('should return 0 when no events to reschedule', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-no-events',
        newDateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      };

      mockEventRepository.findByUserId.mockResolvedValue([]);

      // Act
      const result = await useCase.execute(dto);

      // Assert
      expect(result.rescheduledCount).toBe(0);
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });

    it('should only reschedule PENDING events, ignoring others', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-mixed',
        newDateOfBirth: '1990-03-10',
        timezone: 'America/New_York',
      };

      const pendingEvent = createMockEvent({ status: EventStatus.PENDING });
      const processingEvent = createMockEvent({ status: EventStatus.PROCESSING });
      const completedEvent = createMockEvent({ status: EventStatus.COMPLETED });
      const failedEvent = createMockEvent({ status: EventStatus.FAILED });

      mockEventRepository.findByUserId.mockResolvedValue([
        pendingEvent,
        processingEvent,
        completedEvent,
        failedEvent,
      ]);

      // Act
      const result = await useCase.execute(dto);

      // Assert - Only PENDING rescheduled
      expect(result.rescheduledCount).toBe(1);
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should only reschedule BIRTHDAY events, ignoring other types', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-multi-type',
        newDateOfBirth: '1990-04-25',
        timezone: 'America/New_York',
      };

      const birthdayEvent = createMockEvent({ eventType: 'BIRTHDAY' });
      const anniversaryEvent = createMockEvent({ eventType: 'ANNIVERSARY' });
      const reminderEvent = createMockEvent({ eventType: 'REMINDER' });

      mockEventRepository.findByUserId.mockResolvedValue([
        birthdayEvent,
        anniversaryEvent,
        reminderEvent,
      ]);

      // Act
      const result = await useCase.execute(dto);

      // Assert - Only BIRTHDAY rescheduled
      expect(result.rescheduledCount).toBe(1);
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should calculate new birthday based on new date of birth', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-123',
        newDateOfBirth: '1992-12-25', // Christmas birthday
        timezone: 'America/New_York',
      };

      const oldEvent = createMockEvent();
      mockEventRepository.findByUserId.mockResolvedValue([oldEvent]);

      // Act
      await useCase.execute(dto);

      // Assert - Called update with rescheduled event
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
      const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
      expect(updatedEvent).toBeDefined();

      // New timestamp should be December 25 at 9 AM
      expect(updatedEvent?.targetTimestampLocal.month).toBe(12);
      expect(updatedEvent?.targetTimestampLocal.day).toBe(25);
      expect(updatedEvent?.targetTimestampLocal.hour).toBe(9);
    });

    it('should increment version when rescheduling', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-version',
        newDateOfBirth: '1990-05-05',
        timezone: 'America/New_York',
      };

      const originalEvent = createMockEvent({ version: 1 });
      mockEventRepository.findByUserId.mockResolvedValue([originalEvent]);

      // Act
      await useCase.execute(dto);

      // Assert
      const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
      expect(updatedEvent).toBeDefined();
      expect(updatedEvent?.version).toBe(2);
    });

    it('should update timestamps to future date', async () => {
      // Arrange
      const dto: RescheduleBirthdayEventsDTO = {
        userId: 'user-future',
        newDateOfBirth: '1990-06-15',
        timezone: 'Asia/Tokyo',
      };

      const oldEvent = createMockEvent();
      mockEventRepository.findByUserId.mockResolvedValue([oldEvent]);

      // Act
      await useCase.execute(dto);

      // Assert
      const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
      expect(updatedEvent).toBeDefined();
      expect(updatedEvent && updatedEvent.targetTimestampUTC > DateTime.now()).toBe(true);
    });

    describe('validation', () => {
      it('should throw ZodError when userId is empty', async () => {
        // Arrange
        const dto: RescheduleBirthdayEventsDTO = {
          userId: '',
          newDateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw ZodError when newDateOfBirth is not ISO format', async () => {
        // Arrange
        const dto: RescheduleBirthdayEventsDTO = {
          userId: 'user-123',
          newDateOfBirth: '01/15/1990', // Wrong format
          timezone: 'America/New_York',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw ZodError when timezone is empty', async () => {
        // Arrange
        const dto: RescheduleBirthdayEventsDTO = {
          userId: 'user-123',
          newDateOfBirth: '1990-01-15',
          timezone: '',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });
    });

    describe('timezone handling', () => {
      it('should handle different timezones correctly', async () => {
        // Test multiple timezones
        const timezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

        for (const tz of timezones) {
          // Arrange
          const dto: RescheduleBirthdayEventsDTO = {
            userId: `user-${tz}`,
            newDateOfBirth: '1990-07-15',
            timezone: tz,
          };

          const event = createMockEvent({ userId: `user-${tz}`, targetTimezone: tz });
          mockEventRepository.findByUserId.mockResolvedValue([event]);

          // Act
          await useCase.execute(dto);

          // Assert
          const updatedEvent =
            mockEventRepository.update.mock.calls[
              mockEventRepository.update.mock.calls.length - 1
            ]?.[0];
          expect(updatedEvent).toBeDefined();
          expect(updatedEvent?.targetTimestampLocal.hour).toBe(9);
          expect(updatedEvent?.targetTimezone).toBe(tz);
        }
      });
    });

    describe('leap year handling', () => {
      it('should handle leap year birthdays correctly', async () => {
        // Arrange
        const dto: RescheduleBirthdayEventsDTO = {
          userId: 'leap-user',
          newDateOfBirth: '2000-02-29',
          timezone: 'America/New_York',
        };

        const event = createMockEvent({ userId: 'leap-user' });
        mockEventRepository.findByUserId.mockResolvedValue([event]);

        // Act
        await useCase.execute(dto);

        // Assert
        const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
        expect(updatedEvent).toBeDefined();
        expect(updatedEvent?.targetTimestampLocal.month).toBe(2);
        expect([28, 29]).toContain(updatedEvent?.targetTimestampLocal.day);
      });
    });

    describe('repository integration', () => {
      it('should call repository.findByUserId with correct userId', async () => {
        // Arrange
        const dto: RescheduleBirthdayEventsDTO = {
          userId: 'user-repo-test',
          newDateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        mockEventRepository.findByUserId.mockResolvedValue([]);

        // Act
        await useCase.execute(dto);

        // Assert
        expect(mockEventRepository.findByUserId).toHaveBeenCalledWith('user-repo-test');
        expect(mockEventRepository.findByUserId).toHaveBeenCalledTimes(1);
      });

      it('should propagate repository errors', async () => {
        // Arrange
        const dto: RescheduleBirthdayEventsDTO = {
          userId: 'user-error',
          newDateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        mockEventRepository.findByUserId.mockRejectedValueOnce(new Error('Database error'));

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow('Database error');
      });

      it('should propagate update errors', async () => {
        // Arrange
        const dto: RescheduleBirthdayEventsDTO = {
          userId: 'user-update-error',
          newDateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        const event = createMockEvent({ userId: 'user-update-error' });
        mockEventRepository.findByUserId.mockResolvedValue([event]);
        mockEventRepository.update.mockRejectedValueOnce(new Error('Update failed'));

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow('Update failed');
      });
    });
  });
});
