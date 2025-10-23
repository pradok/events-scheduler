import { UpdateUserUseCase } from './UpdateUserUseCase';
import type { IUserRepository } from '../ports/IUserRepository';
import type { IEventRepository } from '../../../event-scheduling/application/ports/IEventRepository';
import type { TimezoneService } from '../../../event-scheduling/domain/services/TimezoneService';
import type { EventHandlerRegistry } from '../../../event-scheduling/domain/services/event-handlers/EventHandlerRegistry';
import type { IEventHandler } from '../../../event-scheduling/domain/services/event-handlers/IEventHandler';
import { User } from '../../domain/entities/User';
import { Event } from '../../../event-scheduling/domain/entities/Event';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { EventStatus } from '../../../event-scheduling/domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../../event-scheduling/domain/value-objects/IdempotencyKey';
import { DateTime } from 'luxon';
import type { UpdateUserDTO } from '../../../../shared/validation/schemas';

describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockEventRepository: jest.Mocked<IEventRepository>;
  let mockTimezoneService: jest.Mocked<TimezoneService>;
  let mockEventHandlerRegistry: jest.Mocked<EventHandlerRegistry>;
  let mockBirthdayHandler: jest.Mocked<IEventHandler>;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUsersWithUpcomingBirthdays: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    mockEventRepository = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByUserId: jest.fn(),
      claimReadyEvents: jest.fn(),
    } as jest.Mocked<IEventRepository>;

    mockTimezoneService = {
      convertToUTC: jest.fn(),
      convertFromUTC: jest.fn(),
      getTimezoneOffset: jest.fn(),
    } as unknown as jest.Mocked<TimezoneService>;

    mockBirthdayHandler = {
      eventType: 'BIRTHDAY',
      generateEvent: jest.fn(),
      formatMessage: jest.fn(),
      selectDeliveryChannel: jest.fn(),
      calculateNextOccurrence: jest.fn(),
    } as jest.Mocked<IEventHandler>;

    mockEventHandlerRegistry = {
      register: jest.fn(),
      getHandler: jest.fn().mockReturnValue(mockBirthdayHandler),
      getSupportedEventTypes: jest.fn(),
      isSupported: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<EventHandlerRegistry>;

    useCase = new UpdateUserUseCase(
      mockUserRepository,
      mockEventRepository,
      mockTimezoneService,
      mockEventHandlerRegistry
    );
  });

  describe('execute - name updates only', () => {
    it('should update firstName and lastName without rescheduling events', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const dto: UpdateUserDTO = {
        firstName: 'Jane',
        lastName: 'Smith',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(
        new User({ ...user, firstName: 'Jane', lastName: 'Smith' })
      );

      // Act
      const result = await useCase.execute(userId, dto);

      // Assert
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.findByUserId).not.toHaveBeenCalled();
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('execute - birthday rescheduling', () => {
    it('should reschedule PENDING birthday events when dateOfBirth updated', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const oldDate = new DateOfBirth('1990-01-15');
      const newDate = new DateOfBirth('1990-02-14');

      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: oldDate,
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const pendingEvent = new Event({
        id: 'event-123',
        userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: DateTime.fromISO('2026-01-15T14:00:00Z'),
        targetTimestampLocal: DateTime.fromISO('2026-01-15T09:00:00'),
        targetTimezone: 'America/New_York',
        idempotencyKey: IdempotencyKey.fromString('key-123'),
        deliveryPayload: { message: 'Happy Birthday' },
        version: 1,
        retryCount: 0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        executedAt: null,
        failureReason: null,
      });

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
      };

      const nextBirthdayLocal = DateTime.fromISO('2026-02-14T09:00:00');
      const nextBirthdayUTC = DateTime.fromISO('2026-02-14T14:00:00Z');

      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);
      mockBirthdayHandler.calculateNextOccurrence.mockReturnValue(nextBirthdayLocal);
      mockTimezoneService.convertToUTC.mockReturnValue(nextBirthdayUTC);
      mockEventRepository.update.mockResolvedValue(pendingEvent);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, dateOfBirth: newDate }));

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventRepository.findByUserId).toHaveBeenCalledTimes(1);
      expect(mockBirthdayHandler.calculateNextOccurrence).toHaveBeenCalled();
      expect(mockTimezoneService.convertToUTC).toHaveBeenCalledWith(
        nextBirthdayLocal,
        expect.any(Timezone)
      );
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should NOT modify COMPLETED events when birthday updated', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const completedEvent = new Event({
        id: 'event-123',
        userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.COMPLETED,
        targetTimestampUTC: DateTime.fromISO('2025-01-15T14:00:00Z'),
        targetTimestampLocal: DateTime.fromISO('2025-01-15T09:00:00'),
        targetTimezone: 'America/New_York',
        idempotencyKey: IdempotencyKey.fromString('key-123'),
        deliveryPayload: { message: 'Happy Birthday' },
        version: 2,
        retryCount: 0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        executedAt: DateTime.now(),
        failureReason: null,
      });

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.findByUserId.mockResolvedValue([completedEvent]);
      mockUserRepository.update.mockResolvedValue(
        new User({ ...user, dateOfBirth: new DateOfBirth('1990-02-14') })
      );

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });

    it('should NOT modify PROCESSING events when birthday updated', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const processingEvent = new Event({
        id: 'event-123',
        userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PROCESSING,
        targetTimestampUTC: DateTime.fromISO('2025-01-15T14:00:00Z'),
        targetTimestampLocal: DateTime.fromISO('2025-01-15T09:00:00'),
        targetTimezone: 'America/New_York',
        idempotencyKey: IdempotencyKey.fromString('key-123'),
        deliveryPayload: { message: 'Happy Birthday' },
        version: 2,
        retryCount: 0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        executedAt: null,
        failureReason: null,
      });

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.findByUserId.mockResolvedValue([processingEvent]);
      mockUserRepository.update.mockResolvedValue(
        new User({ ...user, dateOfBirth: new DateOfBirth('1990-02-14') })
      );

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });

    it('should NOT modify FAILED events when birthday updated', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const failedEvent = new Event({
        id: 'event-123',
        userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.FAILED,
        targetTimestampUTC: DateTime.fromISO('2025-01-15T14:00:00Z'),
        targetTimestampLocal: DateTime.fromISO('2025-01-15T09:00:00'),
        targetTimezone: 'America/New_York',
        idempotencyKey: IdempotencyKey.fromString('key-123'),
        deliveryPayload: { message: 'Happy Birthday' },
        version: 2,
        retryCount: 3,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        executedAt: null,
        failureReason: 'Delivery failed',
      });

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.findByUserId.mockResolvedValue([failedEvent]);
      mockUserRepository.update.mockResolvedValue(
        new User({ ...user, dateOfBirth: new DateOfBirth('1990-02-14') })
      );

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('execute - timezone rescheduling', () => {
    it('should reschedule PENDING events when timezone updated', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const oldTimezone = new Timezone('America/New_York');
      const newTimezone = new Timezone('America/Los_Angeles');

      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-15'),
        timezone: oldTimezone,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const pendingEvent = new Event({
        id: 'event-123',
        userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: DateTime.fromISO('2026-01-15T14:00:00Z'), // 9AM ET = 2PM UTC
        targetTimestampLocal: DateTime.fromISO('2026-01-15T09:00:00'),
        targetTimezone: 'America/New_York',
        idempotencyKey: IdempotencyKey.fromString('key-123'),
        deliveryPayload: { message: 'Happy Birthday' },
        version: 1,
        retryCount: 0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        executedAt: null,
        failureReason: null,
      });

      const dto: UpdateUserDTO = {
        timezone: 'America/Los_Angeles',
      };

      const newUTC = DateTime.fromISO('2026-01-15T17:00:00Z'); // 9AM PT = 5PM UTC

      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);
      mockTimezoneService.convertToUTC.mockReturnValue(newUTC);
      mockEventRepository.update.mockResolvedValue(pendingEvent);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, timezone: newTimezone }));

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventRepository.findByUserId).toHaveBeenCalledTimes(1);
      expect(mockTimezoneService.convertToUTC).toHaveBeenCalledWith(
        pendingEvent.targetTimestampLocal,
        newTimezone
      );
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should NOT modify COMPLETED events when timezone updated', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const completedEvent = new Event({
        id: 'event-123',
        userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.COMPLETED,
        targetTimestampUTC: DateTime.fromISO('2025-01-15T14:00:00Z'),
        targetTimestampLocal: DateTime.fromISO('2025-01-15T09:00:00'),
        targetTimezone: 'America/New_York',
        idempotencyKey: IdempotencyKey.fromString('key-123'),
        deliveryPayload: { message: 'Happy Birthday' },
        version: 2,
        retryCount: 0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        executedAt: DateTime.now(),
        failureReason: null,
      });

      const dto: UpdateUserDTO = {
        timezone: 'America/Los_Angeles',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.findByUserId.mockResolvedValue([completedEvent]);
      mockUserRepository.update.mockResolvedValue(
        new User({ ...user, timezone: new Timezone('America/Los_Angeles') })
      );

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('execute - combined updates', () => {
    it('should reschedule events for both birthday and timezone change', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const pendingEvent = new Event({
        id: 'event-123',
        userId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: DateTime.fromISO('2026-01-15T14:00:00Z'),
        targetTimestampLocal: DateTime.fromISO('2026-01-15T09:00:00'),
        targetTimezone: 'America/New_York',
        idempotencyKey: IdempotencyKey.fromString('key-123'),
        deliveryPayload: { message: 'Happy Birthday' },
        version: 1,
        retryCount: 0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        executedAt: null,
        failureReason: null,
      });

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
        timezone: 'America/Los_Angeles',
      };

      const nextBirthdayLocal = DateTime.fromISO('2026-02-14T09:00:00');
      const nextBirthdayUTC = DateTime.fromISO('2026-02-14T17:00:00Z');

      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.findByUserId.mockResolvedValue([pendingEvent]);
      mockBirthdayHandler.calculateNextOccurrence.mockReturnValue(nextBirthdayLocal);
      mockTimezoneService.convertToUTC.mockReturnValue(nextBirthdayUTC);
      mockEventRepository.update.mockResolvedValue(pendingEvent);
      mockUserRepository.update.mockResolvedValue(
        new User({
          ...user,
          dateOfBirth: new DateOfBirth('1990-02-14'),
          timezone: new Timezone('America/Los_Angeles'),
        })
      );

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
      expect(mockBirthdayHandler.calculateNextOccurrence).toHaveBeenCalled();
      expect(mockTimezoneService.convertToUTC).toHaveBeenCalled();
    });
  });

  describe('execute - error handling', () => {
    it('should throw UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: UpdateUserDTO = { firstName: 'Jane' };

      mockUserRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(userId, dto)).rejects.toThrow('User not found');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });
});
