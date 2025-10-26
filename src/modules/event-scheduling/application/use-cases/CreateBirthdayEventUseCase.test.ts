import { DateTime } from 'luxon';
import { CreateBirthdayEventUseCase } from './CreateBirthdayEventUseCase';
import { IEventRepository } from '../ports/IEventRepository';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../domain/services/event-handlers/EventHandlerRegistry';
import { BirthdayEventHandler } from '../../domain/services/event-handlers/BirthdayEventHandler';
import { CreateBirthdayEventDTO } from '../dtos/CreateBirthdayEventDTO';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { ZodError } from 'zod';
import { StaticWebhookConfig } from '../../config/webhook-config';

describe('CreateBirthdayEventUseCase', () => {
  let useCase: CreateBirthdayEventUseCase;
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
    const webhookConfig = new StaticWebhookConfig('https://webhook.test/endpoint');
    useCase = new CreateBirthdayEventUseCase(
      mockEventRepository,
      timezoneService,
      eventHandlerRegistry,
      webhookConfig
    );
  });

  describe('execute()', () => {
    it('should create birthday event with valid DTO', async () => {
      // Arrange
      const dto: CreateBirthdayEventDTO = {
        userId: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      };

      // Act
      const event = await useCase.execute(dto);

      // Assert - Event created
      expect(mockEventRepository.create).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.create).toHaveBeenCalledWith(event);

      // Assert - Event properties
      expect(event.userId).toBe('user-123');
      expect(event.eventType).toBe('BIRTHDAY');
      expect(event.status).toBe(EventStatus.PENDING);

      // Assert - Timestamps
      expect(event.targetTimestampLocal.hour).toBe(9);
      expect(event.targetTimestampLocal.minute).toBe(0);
      expect(event.targetTimestampLocal.zoneName).toBe('America/New_York');

      // Assert - UTC conversion
      expect(event.targetTimestampUTC.zoneName).toBe('UTC');

      // Assert - Delivery payload
      expect(event.deliveryPayload.message).toBe("Hey, John Doe it's your birthday");

      // Assert - Idempotency
      expect(event.idempotencyKey).toBeDefined();

      // Assert - Versioning
      expect(event.version).toBe(1);
      expect(event.retryCount).toBe(0);
    });

    it('should return the created event', async () => {
      // Arrange
      const dto: CreateBirthdayEventDTO = {
        userId: 'user-456',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1995-06-20',
        timezone: 'Europe/London',
      };

      // Act
      const event = await useCase.execute(dto);

      // Assert - Returns Event entity
      expect(event).toBeDefined();
      expect(event.userId).toBe('user-456');
    });

    it('should create event with future target timestamp', async () => {
      // Arrange
      const dto: CreateBirthdayEventDTO = {
        userId: 'user-789',
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: '2000-12-25',
        timezone: 'Asia/Tokyo',
      };

      // Act
      const event = await useCase.execute(dto);

      // Assert - Target timestamp should be in the future
      expect(event.targetTimestampUTC > DateTime.now()).toBe(true);
    });

    it('should handle leap year birthdays correctly', async () => {
      // Arrange
      const dto: CreateBirthdayEventDTO = {
        userId: 'leap-user',
        firstName: 'Leap',
        lastName: 'Year',
        dateOfBirth: '2000-02-29',
        timezone: 'America/New_York',
      };

      // Act
      const event = await useCase.execute(dto);

      // Assert - Should handle Feb 29 correctly
      expect(event.targetTimestampLocal.month).toBe(2);
      // Day will be 28 or 29 depending on leap year
      expect([28, 29]).toContain(event.targetTimestampLocal.day);
      expect(event.targetTimestampLocal.hour).toBe(9);
    });

    describe('validation', () => {
      it('should throw ZodError when userId is empty', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: '',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw ZodError when firstName is empty', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-123',
          firstName: '',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw ZodError when lastName is empty', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-123',
          firstName: 'John',
          lastName: '',
          dateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw ZodError when dateOfBirth is not ISO format', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '01/15/1990', // Wrong format
          timezone: 'America/New_York',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });

      it('should throw ZodError when timezone is empty', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          timezone: '',
        };

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow(ZodError);
      });
    });

    describe('timezone handling', () => {
      it('should handle different timezones correctly', async () => {
        // Test multiple timezones
        const timezones = [
          'America/New_York',
          'Europe/London',
          'Asia/Tokyo',
          'Australia/Sydney',
          'America/Los_Angeles',
        ];

        for (const tz of timezones) {
          // Arrange
          const dto: CreateBirthdayEventDTO = {
            userId: `user-${tz}`,
            firstName: 'Test',
            lastName: 'User',
            dateOfBirth: '1990-07-15',
            timezone: tz,
          };

          // Act
          const event = await useCase.execute(dto);

          // Assert - Local time always 9 AM
          expect(event.targetTimestampLocal.hour).toBe(9);
          expect(event.targetTimestampLocal.zoneName).toBe(tz);

          // Assert - UTC conversion happened
          expect(event.targetTimestampUTC.zoneName).toBe('UTC');
        }
      });
    });

    describe('idempotency', () => {
      it('should generate unique idempotency keys for different users', async () => {
        // Arrange
        const dto1: CreateBirthdayEventDTO = {
          userId: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        const dto2: CreateBirthdayEventDTO = {
          userId: 'user-2',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        // Act
        const event1 = await useCase.execute(dto1);
        const event2 = await useCase.execute(dto2);

        // Assert - Different idempotency keys
        expect(event1.idempotencyKey.toString()).not.toBe(event2.idempotencyKey.toString());
      });

      it('should generate same idempotency key for same user and timestamp (deterministic)', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        // Act - Execute twice with same input
        const event1 = await useCase.execute(dto);
        const event2 = await useCase.execute(dto);

        // Assert - Same idempotency key (deterministic generation)
        // Note: Both events will have same target timestamp since birthdays are predictable
        expect(event1.idempotencyKey.toString()).toBe(event2.idempotencyKey.toString());
      });

      it('should generate idempotency key based on userId and targetTimestampUTC', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-test-123',
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: '1995-06-20',
          timezone: 'Europe/London',
        };

        // Act
        const event = await useCase.execute(dto);

        // Assert - Idempotency key exists and has expected format
        expect(event.idempotencyKey).toBeDefined();
        expect(event.idempotencyKey.toString()).toMatch(/^event-[a-f0-9]{16}$/);
      });
    });

    describe('repository integration', () => {
      it('should call repository.create with correct event', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-999',
          firstName: 'Alice',
          lastName: 'Wonder',
          dateOfBirth: '1992-03-30',
          timezone: 'America/Chicago',
        };

        // Act
        const event = await useCase.execute(dto);

        // Assert
        expect(mockEventRepository.create).toHaveBeenCalledWith(event);
        expect(mockEventRepository.create).toHaveBeenCalledTimes(1);
      });

      it('should propagate repository errors', async () => {
        // Arrange
        const dto: CreateBirthdayEventDTO = {
          userId: 'user-error',
          firstName: 'Error',
          lastName: 'Test',
          dateOfBirth: '1990-01-15',
          timezone: 'America/New_York',
        };

        mockEventRepository.create.mockRejectedValueOnce(new Error('Database error'));

        // Act & Assert
        await expect(useCase.execute(dto)).rejects.toThrow('Database error');
      });
    });
  });
});
