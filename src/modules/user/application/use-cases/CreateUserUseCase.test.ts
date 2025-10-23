/* eslint-disable @typescript-eslint/unbound-method */
// Disabled unbound-method rule for Jest expect calls - this is a known false positive with Jest
import { CreateUserUseCase } from './CreateUserUseCase';
import { CreateUserDTO } from '@shared/validation/schemas';
import { IUserRepository } from '../ports/IUserRepository';
import { IDomainEventBus } from '@shared/events/IDomainEventBus';
import { UserCreatedEvent } from '../../domain/events/UserCreated';
import { User } from '../../domain/entities/User';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '@shared/value-objects/Timezone';
import { DateTime } from 'luxon';

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockEventBus: jest.Mocked<IDomainEventBus>;

  beforeEach(() => {
    // Mock UserRepository
    mockUserRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUsersWithUpcomingBirthdays: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    // Mock IDomainEventBus
    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
    } as jest.Mocked<IDomainEventBus>;

    // Create use case instance with only 2 dependencies
    useCase = new CreateUserUseCase(mockUserRepository, mockEventBus);
  });

  describe('execute', () => {
    it('should create user and publish UserCreatedEvent', async () => {
      // Arrange
      const dto: CreateUserDTO = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      };

      // Mock repository response (return the user entity)
      mockUserRepository.create.mockImplementation((user: User) => Promise.resolve(user));
      mockEventBus.publish.mockResolvedValue(undefined);

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

      // Assert - Verify UserCreatedEvent was published
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishCall = mockEventBus.publish.mock.calls[0];
      expect(publishCall).toBeDefined();
      const publishedEvent = publishCall![0] as UserCreatedEvent;
      expect(publishedEvent.eventType).toBe('UserCreated');
      expect(publishedEvent.context).toBe('user');
      expect(publishedEvent.occurredAt).toBeDefined();
      expect(publishedEvent.aggregateId).toBe(createdUser.id);
      expect(publishedEvent.userId).toBe(createdUser.id);
      expect(publishedEvent.firstName).toBe('John');
      expect(publishedEvent.lastName).toBe('Doe');
      expect(publishedEvent.dateOfBirth).toBe('1990-01-15');
      expect(publishedEvent.timezone).toBe('America/New_York');

      // Assert - Verify result is the created user
      expect(result).toBeInstanceOf(User);
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should publish event AFTER user persisted (correct ordering)', async () => {
      // Arrange
      const dto: CreateUserDTO = {
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1985-06-20',
        timezone: 'Europe/London',
      };

      const callOrder: string[] = [];

      mockUserRepository.create.mockImplementation((user: User) => {
        callOrder.push('userRepository.create');
        return Promise.resolve(user);
      });

      mockEventBus.publish.mockImplementation(() => {
        callOrder.push('eventBus.publish');
        return Promise.resolve();
      });

      // Act
      await useCase.execute(dto);

      // Assert - Verify call order
      expect(callOrder).toEqual(['userRepository.create', 'eventBus.publish']);
    });

    it('should NOT publish event if user creation fails', async () => {
      // Arrange
      const dto: CreateUserDTO = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        timezone: 'America/New_York',
      };

      const repositoryError = new Error('Database connection failed');
      mockUserRepository.create.mockRejectedValue(repositoryError);

      // Act & Assert
      await expect(useCase.execute(dto)).rejects.toThrow('Database connection failed');

      // Assert - User repository was called, but event bus should NOT be called
      expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).not.toHaveBeenCalled();
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

      // Assert - No repository or event bus methods should be called
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
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

      // Assert - No repository or event bus methods should be called
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
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

      // Assert - No repository or event bus methods should be called
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should throw ZodError for missing required fields', async () => {
      // Arrange
      const invalidDto = {
        firstName: 'John',
        lastName: 'Doe',
        // Missing dateOfBirth and timezone
      } as CreateUserDTO;

      // Act & Assert
      await expect(useCase.execute(invalidDto)).rejects.toThrow();

      // Assert - No repository or event bus methods should be called
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });
});
