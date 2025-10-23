/* eslint-disable @typescript-eslint/unbound-method */
// Disabled unbound-method rule for Jest expect calls - this is a known false positive with Jest
import { CreateUserUseCase } from './CreateUserUseCase';
import { CreateUserDTO } from '@shared/validation/schemas';
import { IUserRepository } from '../ports/IUserRepository';
import { IEventRepository } from '@modules/event-scheduling/application/ports/IEventRepository';
import { TimezoneService } from '@modules/event-scheduling/domain/services/TimezoneService';
import { EventHandlerRegistry } from '@modules/event-scheduling/domain/services/event-handlers/EventHandlerRegistry';
import { BirthdayEventHandler } from '@modules/event-scheduling/domain/services/event-handlers/BirthdayEventHandler';
import { User } from '../../domain/entities/User';
import { Event } from '@modules/event-scheduling/domain/entities/Event';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '@shared/value-objects/Timezone';
import { EventStatus } from '@modules/event-scheduling/domain/value-objects/EventStatus';
import { DateTime } from 'luxon';

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockEventRepository: jest.Mocked<IEventRepository>;
  let mockTimezoneService: jest.Mocked<TimezoneService>;
  let mockEventHandlerRegistry: jest.Mocked<EventHandlerRegistry>;
  let mockBirthdayHandler: jest.Mocked<BirthdayEventHandler>;

  beforeEach(() => {
    // Mock repositories
    mockUserRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUsersWithUpcomingBirthdays: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    mockEventRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByUserId: jest.fn(),
      claimReadyEvents: jest.fn(),
      findBySpecification: jest.fn(),
    } as jest.Mocked<IEventRepository>;

    // Mock TimezoneService
    mockTimezoneService = {
      convertToUTC: jest.fn(),
      convertToLocalTime: jest.fn(),
      isValidTimezone: jest.fn(),
    } as unknown as jest.Mocked<TimezoneService>;

    // Mock BirthdayEventHandler
    mockBirthdayHandler = {
      eventType: 'BIRTHDAY',
      calculateNextOccurrence: jest.fn(),
      formatMessage: jest.fn(),
      generateEvent: jest.fn(),
      selectDeliveryChannel: jest.fn(),
    } as unknown as jest.Mocked<BirthdayEventHandler>;

    // Mock EventHandlerRegistry
    mockEventHandlerRegistry = {
      register: jest.fn(),
      getHandler: jest.fn().mockReturnValue(mockBirthdayHandler),
      getSupportedEventTypes: jest.fn(),
    } as unknown as jest.Mocked<EventHandlerRegistry>;

    // Create use case instance
    useCase = new CreateUserUseCase(
      mockUserRepository,
      mockEventRepository,
      mockTimezoneService,
      mockEventHandlerRegistry
    );
  });

  describe('execute', () => {
    it('should create user and event atomically with correct timezone calculations', async () => {
      // Arrange
      const dto: CreateUserDTO = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      };

      const nextBirthdayLocal = DateTime.fromISO('2026-01-15T09:00:00', {
        zone: 'America/New_York',
      });
      const nextBirthdayUTC = DateTime.fromISO('2026-01-15T14:00:00', { zone: 'UTC' });

      // Mock handler calculations
      mockBirthdayHandler.calculateNextOccurrence.mockReturnValue(nextBirthdayLocal);
      mockBirthdayHandler.formatMessage.mockReturnValue("Hey, John Doe it's your birthday");
      mockTimezoneService.convertToUTC.mockReturnValue(nextBirthdayUTC);

      // Mock repository responses (return the entities we expect)
      mockUserRepository.create.mockImplementation((user: User) => Promise.resolve(user));
      mockEventRepository.create.mockImplementation((event: Event) => Promise.resolve(event));

      // Act
      const result = await useCase.execute(dto);

      // Assert - Verify user was created
      expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
      const userCall = mockUserRepository.create.mock.calls[0];
      expect(userCall).toBeDefined();
      const createdUser = userCall![0];
      expect(createdUser).toBeInstanceOf(User);
      expect(createdUser.firstName).toBe('John');
      expect(createdUser.lastName).toBe('Doe');
      expect(createdUser.dateOfBirth).toBeInstanceOf(DateOfBirth);
      expect(createdUser.timezone).toBeInstanceOf(Timezone);
      expect(createdUser.timezone.toString()).toBe('America/New_York');

      // Assert - Verify event was created
      expect(mockEventRepository.create).toHaveBeenCalledTimes(1);
      const eventCall = mockEventRepository.create.mock.calls[0];
      expect(eventCall).toBeDefined();
      const createdEvent = eventCall![0];
      expect(createdEvent).toBeInstanceOf(Event);
      expect(createdEvent.eventType).toBe('BIRTHDAY');
      expect(createdEvent.status).toBe(EventStatus.PENDING);
      expect(createdEvent.targetTimestampUTC.toISO()).toBe(nextBirthdayUTC.toISO());
      expect(createdEvent.targetTimestampLocal.toISO()).toBe(nextBirthdayLocal.toISO());
      expect(createdEvent.targetTimezone).toBe('America/New_York');

      // Assert - Verify handler was called correctly
      expect(mockEventHandlerRegistry.getHandler).toHaveBeenCalledWith('BIRTHDAY');
      expect(mockBirthdayHandler.calculateNextOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({
          id: createdUser.id,
          firstName: createdUser.firstName,
          lastName: createdUser.lastName,
        })
      );
      expect(mockTimezoneService.convertToUTC).toHaveBeenCalledWith(
        nextBirthdayLocal,
        expect.any(Timezone)
      );

      // Assert - Verify result is the created user
      expect(result).toBeInstanceOf(User);
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should throw InvalidTimezoneError for invalid timezone', async () => {
      // Arrange
      const dto: CreateUserDTO = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        timezone: 'Invalid/Timezone',
      };

      // Act & Assert
      await expect(useCase.execute(dto)).rejects.toThrow('Invalid timezone');

      // Assert - No repository methods should be called
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventRepository.create).not.toHaveBeenCalled();
    });

    it('should throw InvalidDateOfBirthError for future date', async () => {
      // Arrange
      const futureDate = DateTime.now().plus({ days: 1 }).toISODate();
      if (!futureDate) {
        throw new Error('Failed to generate future date for test');
      }
      const dto: CreateUserDTO = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: futureDate,
        timezone: 'America/New_York',
      };

      // Act & Assert
      await expect(useCase.execute(dto)).rejects.toThrow('Date of birth cannot be in the future');

      // Assert - No repository methods should be called
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventRepository.create).not.toHaveBeenCalled();
    });

    it('should throw ZodError for invalid input format', async () => {
      // Arrange
      const invalidDto = {
        firstName: '',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      } as CreateUserDTO;

      // Act & Assert
      await expect(useCase.execute(invalidDto)).rejects.toThrow();

      // Assert - No repository methods should be called
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventRepository.create).not.toHaveBeenCalled();
    });

    it('should handle repository failure and propagate error', async () => {
      // Arrange
      const dto: CreateUserDTO = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      };

      const nextBirthdayLocal = DateTime.fromISO('2026-01-15T09:00:00', {
        zone: 'America/New_York',
      });
      const nextBirthdayUTC = DateTime.fromISO('2026-01-15T14:00:00', { zone: 'UTC' });

      mockBirthdayHandler.calculateNextOccurrence.mockReturnValue(nextBirthdayLocal);
      mockBirthdayHandler.formatMessage.mockReturnValue("Hey, John Doe it's your birthday");
      mockTimezoneService.convertToUTC.mockReturnValue(nextBirthdayUTC);

      // Mock repository to throw error
      const repositoryError = new Error('Database connection failed');
      mockUserRepository.create.mockRejectedValue(repositoryError);

      // Act & Assert
      await expect(useCase.execute(dto)).rejects.toThrow('Database connection failed');

      // Assert - User repository was called, but event repository should not be called
      expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.create).not.toHaveBeenCalled();
    });
  });
});
