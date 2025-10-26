import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { RescheduleEventsOnTimezoneChangeUseCase } from './RescheduleEventsOnTimezoneChangeUseCase';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { RescheduleEventsOnTimezoneChangeDTO } from '../dtos/RescheduleEventsOnTimezoneChangeDTO';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { ZodError } from 'zod';

describe('RescheduleEventsOnTimezoneChangeUseCase', () => {
  let useCase: RescheduleEventsOnTimezoneChangeUseCase;
  let mockEventRepository: jest.Mocked<IEventRepository>;
  let timezoneService: TimezoneService;

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
    useCase = new RescheduleEventsOnTimezoneChangeUseCase(mockEventRepository, timezoneService);
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
    it('should reschedule PENDING events when timezone changes', async () => {
      // Arrange
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-123',
        newTimezone: 'Europe/London',
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
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-456',
        newTimezone: 'Asia/Tokyo',
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
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-no-events',
        newTimezone: 'America/New_York',
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
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-mixed',
        newTimezone: 'Europe/Paris',
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

    it('should reschedule ALL event types (not just BIRTHDAY)', async () => {
      // Arrange
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-multi-type',
        newTimezone: 'Australia/Sydney',
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

      // Assert - All event types rescheduled
      expect(result.rescheduledCount).toBe(3);
      expect(mockEventRepository.update).toHaveBeenCalledTimes(3);
    });

    it('should keep local time unchanged but recalculate UTC', async () => {
      // Arrange
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-123',
        newTimezone: 'Europe/London',
      };

      // Create event at 9:00 AM New York time
      const localTime = DateTime.fromObject(
        { year: 2026, month: 1, day: 15, hour: 9, minute: 0, second: 0 },
        { zone: 'America/New_York' }
      );
      const utcTime = localTime.toUTC();

      const oldEvent = createMockEvent({
        targetTimestampLocal: localTime,
        targetTimestampUTC: utcTime,
        targetTimezone: 'America/New_York',
      });
      mockEventRepository.findByUserId.mockResolvedValue([oldEvent]);

      // Act
      await useCase.execute(dto);

      // Assert - Local time unchanged, UTC recalculated
      const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
      expect(updatedEvent).toBeDefined();

      // Local time should be the same (9:00 AM)
      expect(updatedEvent?.targetTimestampLocal.hour).toBe(9);
      expect(updatedEvent?.targetTimestampLocal.minute).toBe(0);
      expect(updatedEvent?.targetTimestampLocal.year).toBe(2026);
      expect(updatedEvent?.targetTimestampLocal.month).toBe(1);
      expect(updatedEvent?.targetTimestampLocal.day).toBe(15);

      // But UTC should be different (New York is UTC-5, London is UTC+0)
      expect(updatedEvent?.targetTimestampUTC).not.toEqual(utcTime);
    });

    it('should increment version when rescheduling', async () => {
      // Arrange
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-version',
        newTimezone: 'Asia/Tokyo',
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

    it('should update targetTimezone field', async () => {
      // Arrange
      const dto: RescheduleEventsOnTimezoneChangeDTO = {
        userId: 'user-tz-field',
        newTimezone: 'Europe/Berlin',
      };

      const oldEvent = createMockEvent({ targetTimezone: 'America/New_York' });
      mockEventRepository.findByUserId.mockResolvedValue([oldEvent]);

      // Act
      await useCase.execute(dto);

      // Assert
      const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
      expect(updatedEvent).toBeDefined();
      expect(updatedEvent?.targetTimezone).toBe('Europe/Berlin');
    });

    describe('validation', () => {
      it('should throw ZodError when userId is empty', async () => {
        // Arrange
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: '',
          newTimezone: 'America/New_York',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw ZodError when newTimezone is empty', async () => {
        // Arrange
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: 'user-123',
          newTimezone: '',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw Error when timezone is invalid', async () => {
        // Arrange
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: 'user-123',
          newTimezone: 'Invalid/Timezone',
        };

        mockEventRepository.findByUserId.mockResolvedValue([createMockEvent()]);

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow();
      });
    });

    describe('timezone handling', () => {
      it('should handle different timezones correctly', async () => {
        // Test multiple timezone changes
        const timezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

        for (const tz of timezones) {
          // Arrange
          const dto: RescheduleEventsOnTimezoneChangeDTO = {
            userId: `user-${tz}`,
            newTimezone: tz,
          };

          // Start with event at 9 AM in Los Angeles timezone
          const localTime = DateTime.fromObject(
            { year: 2026, month: 6, day: 15, hour: 9, minute: 0, second: 0 },
            { zone: 'America/Los_Angeles' }
          );
          const utcTime = localTime.toUTC();

          const event = createMockEvent({
            userId: `user-${tz}`,
            targetTimestampLocal: localTime,
            targetTimestampUTC: utcTime,
            targetTimezone: 'America/Los_Angeles',
          });
          mockEventRepository.findByUserId.mockResolvedValue([event]);

          // Act
          await useCase.execute(dto);

          // Assert
          const updatedEvent =
            mockEventRepository.update.mock.calls[
              mockEventRepository.update.mock.calls.length - 1
            ]?.[0];
          expect(updatedEvent).toBeDefined();
          expect(updatedEvent?.targetTimezone).toBe(tz);
          expect(updatedEvent?.targetTimestampLocal.hour).toBe(9); // Local time unchanged
        }
      });

      it('should handle DST transitions correctly', async () => {
        // Arrange - Event scheduled during DST in New York
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: 'user-dst',
          newTimezone: 'Europe/London',
        };

        // Summer time in New York (DST active)
        const localTime = DateTime.fromObject(
          { year: 2026, month: 7, day: 15, hour: 9, minute: 0, second: 0 },
          { zone: 'America/New_York' }
        );
        const utcTime = localTime.toUTC();

        const event = createMockEvent({
          targetTimestampLocal: localTime,
          targetTimestampUTC: utcTime,
          targetTimezone: 'America/New_York',
        });
        mockEventRepository.findByUserId.mockResolvedValue([event]);

        // Act
        await useCase.execute(dto);

        // Assert - Correct UTC conversion for London (no DST in 2026 July)
        const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
        expect(updatedEvent).toBeDefined();
        expect(updatedEvent?.targetTimezone).toBe('Europe/London');
        expect(updatedEvent?.targetTimestampLocal.hour).toBe(9); // Still 9 AM local
      });
    });

    describe('repository integration', () => {
      it('should call repository.findByUserId with correct userId', async () => {
        // Arrange
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: 'user-repo-test',
          newTimezone: 'America/New_York',
        };

        mockEventRepository.findByUserId.mockResolvedValue([]);

        // Act
        await useCase.execute(dto);

        // Assert
        expect(mockEventRepository.findByUserId).toHaveBeenCalledWith('user-repo-test');
        expect(mockEventRepository.findByUserId).toHaveBeenCalledTimes(1);
      });

      it('should propagate repository errors from findByUserId', async () => {
        // Arrange
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: 'user-error',
          newTimezone: 'America/New_York',
        };

        mockEventRepository.findByUserId.mockRejectedValueOnce(new Error('Database error'));

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow('Database error');
      });

      it('should propagate update errors', async () => {
        // Arrange
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: 'user-update-error',
          newTimezone: 'America/New_York',
        };

        const event = createMockEvent({ userId: 'user-update-error' });
        mockEventRepository.findByUserId.mockResolvedValue([event]);
        mockEventRepository.update.mockRejectedValueOnce(new Error('Update failed'));

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow('Update failed');
      });

      it('should call update once per PENDING event', async () => {
        // Arrange
        const dto: RescheduleEventsOnTimezoneChangeDTO = {
          userId: 'user-multi',
          newTimezone: 'Europe/Paris',
        };

        const pendingEvents = [
          createMockEvent({ status: EventStatus.PENDING }),
          createMockEvent({ status: EventStatus.PENDING }),
          createMockEvent({ status: EventStatus.PENDING }),
        ];
        const completedEvent = createMockEvent({ status: EventStatus.COMPLETED });

        mockEventRepository.findByUserId.mockResolvedValue([...pendingEvents, completedEvent]);

        // Act
        await useCase.execute(dto);

        // Assert - Called 3 times for PENDING events only
        expect(mockEventRepository.update).toHaveBeenCalledTimes(3);
      });
    });
  });
});
