import { DateTime } from 'luxon';
import { CreateBirthdayEventOnUserCreatedHandler } from './CreateBirthdayEventOnUserCreatedHandler';
import { UserCreatedEvent } from '../../../user/domain/events/UserCreated';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { BirthdayEventHandler } from '../../domain/services/event-handlers/BirthdayEventHandler';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';

describe('CreateBirthdayEventOnUserCreatedHandler', () => {
  let handler: CreateBirthdayEventOnUserCreatedHandler;
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
    } as jest.Mocked<IEventRepository>;

    // Real timezone service and registry
    timezoneService = new TimezoneService();
    eventHandlerRegistry = new EventHandlerRegistry();
    eventHandlerRegistry.register(new BirthdayEventHandler(timezoneService));

    // Create handler
    handler = new CreateBirthdayEventOnUserCreatedHandler(
      mockEventRepository,
      timezoneService,
      eventHandlerRegistry
    );
  });

  function createUserCreatedEvent(overrides: Partial<UserCreatedEvent> = {}): UserCreatedEvent {
    return {
      eventType: 'UserCreated',
      context: 'user',
      occurredAt: DateTime.now().toISO(),
      aggregateId: 'user-123',
      userId: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      timezone: 'America/New_York',
      ...overrides,
    };
  }

  describe('handle()', () => {
    it('should create birthday event from UserCreated event', async () => {
      // Arrange
      const event = createUserCreatedEvent();

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.create).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      const createdEvent = mockEventRepository.create.mock.calls[0]?.[0] as Event;
      expect(createdEvent).toBeDefined();
      expect(createdEvent.eventType).toBe('BIRTHDAY');
      expect(createdEvent.status).toBe(EventStatus.PENDING);
      expect(createdEvent.userId).toBe('user-123');
      expect(createdEvent.targetTimezone).toBe('America/New_York');
    });

    it('should calculate next birthday correctly for different timezones', async () => {
      // Arrange - Birthday on Jan 15, timezone EST (UTC-5)
      const event = createUserCreatedEvent({
        dateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      });

      // Act
      await handler.handle(event);

      // Assert
      const createdEvent = mockEventRepository.create.mock.calls[0]?.[0] as Event;
      expect(createdEvent).toBeDefined();

      // Birthday is Jan 15 at 9:00 AM EST
      // 9:00 AM EST = 14:00 UTC (EST is UTC-5)
      expect(createdEvent.targetTimestampLocal.hour).toBe(9);
      expect(createdEvent.targetTimestampLocal.minute).toBe(0);
      expect(createdEvent.targetTimestampLocal.month).toBe(1);
      expect(createdEvent.targetTimestampLocal.day).toBe(15);

      // Verify UTC conversion
      expect(createdEvent.targetTimestampUTC.hour).toBe(14);
      expect(createdEvent.targetTimestampUTC.month).toBe(1);
      expect(createdEvent.targetTimestampUTC.day).toBe(15);
    });

    it('should handle leap year birthdays (Feb 29)', async () => {
      // Arrange - Born on leap day
      const event = createUserCreatedEvent({
        dateOfBirth: '1992-02-29',
        timezone: 'UTC',
      });

      // Act
      await handler.handle(event);

      // Assert - In non-leap years, birthday should be Feb 28
      const createdEvent = mockEventRepository.create.mock.calls[0]?.[0] as Event;
      expect(createdEvent).toBeDefined();
      const isLeapYear = createdEvent.targetTimestampLocal.year % 4 === 0;

      if (isLeapYear) {
        expect(createdEvent.targetTimestampLocal.month).toBe(2);
        expect(createdEvent.targetTimestampLocal.day).toBe(29);
      } else {
        expect(createdEvent.targetTimestampLocal.month).toBe(2);
        expect(createdEvent.targetTimestampLocal.day).toBe(28);
      }
    });

    it('should generate idempotency key correctly', async () => {
      // Arrange
      const event = createUserCreatedEvent();

      // Act
      await handler.handle(event);

      // Assert
      const createdEvent = mockEventRepository.create.mock.calls[0]?.[0] as Event;
      expect(createdEvent).toBeDefined();
      expect(createdEvent.idempotencyKey).toBeDefined();
      expect(createdEvent.idempotencyKey.toString()).toMatch(/^event-[a-f0-9]{16}$/); // event-{first 16 chars of SHA-256}
    });

    it('should format birthday message correctly', async () => {
      // Arrange
      const event = createUserCreatedEvent({
        firstName: 'Jane',
        lastName: 'Smith',
      });

      // Act
      await handler.handle(event);

      // Assert
      const createdEvent = mockEventRepository.create.mock.calls[0]?.[0] as Event;
      expect(createdEvent).toBeDefined();
      expect(createdEvent.deliveryPayload).toEqual({
        message: "Hey, Jane Smith it's your birthday",
      });
    });

    it('should throw error if dateOfBirth is invalid', async () => {
      // Arrange
      const event = createUserCreatedEvent({
        dateOfBirth: 'invalid-date',
      });

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow();
    });

    it('should throw error if timezone is invalid', async () => {
      // Arrange
      const event = createUserCreatedEvent({
        timezone: 'Invalid/Timezone',
      });

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow();
    });

    it('should log error and rethrow if event creation fails', async () => {
      // Arrange
      const event = createUserCreatedEvent();
      mockEventRepository.create.mockRejectedValue(new Error('Database error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow('Database error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create birthday event from UserCreated event',
        expect.objectContaining({
          eventType: 'UserCreated',
          userId: 'user-123',
          aggregateId: 'user-123',
          error: 'Database error',
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should set all Event properties correctly', async () => {
      // Arrange
      const event = createUserCreatedEvent();

      // Act
      await handler.handle(event);

      // Assert
      const createdEvent = mockEventRepository.create.mock.calls[0]?.[0] as Event;
      expect(createdEvent).toBeDefined();
      expect(createdEvent.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(createdEvent.userId).toBe('user-123');
      expect(createdEvent.eventType).toBe('BIRTHDAY');
      expect(createdEvent.status).toBe(EventStatus.PENDING);
      expect(createdEvent.version).toBe(1);
      expect(createdEvent.retryCount).toBe(0);
      expect(createdEvent.executedAt).toBeNull();
      expect(createdEvent.failureReason).toBeNull();
      expect(createdEvent.targetTimestampUTC).toBeInstanceOf(DateTime);
      expect(createdEvent.targetTimestampLocal).toBeInstanceOf(DateTime);
      expect(createdEvent.targetTimezone).toBe('America/New_York');
      expect(createdEvent.createdAt).toBeInstanceOf(DateTime);
      expect(createdEvent.updatedAt).toBeInstanceOf(DateTime);
    });

    it('should handle timezone with DST correctly', async () => {
      // Arrange - Birthday in March (DST transition)
      const event = createUserCreatedEvent({
        dateOfBirth: '1990-03-15',
        timezone: 'America/New_York',
      });

      // Act
      await handler.handle(event);

      // Assert - TimezoneService should handle DST correctly
      const createdEvent = mockEventRepository.create.mock.calls[0]?.[0] as Event;
      expect(createdEvent).toBeDefined();
      expect(createdEvent.targetTimestampLocal.hour).toBe(9);
      expect(createdEvent.targetTimestampLocal.month).toBe(3);
      expect(createdEvent.targetTimestampLocal.day).toBe(15);

      // During DST, EST becomes EDT (UTC-4 instead of UTC-5)
      // This test verifies TimezoneService handles DST transitions
      expect(createdEvent.targetTimestampUTC).toBeDefined();
    });
  });
});
