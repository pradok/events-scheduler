import { UpdateUserUseCase } from './UpdateUserUseCase';
import type { IUserRepository } from '../ports/IUserRepository';
import type { IDomainEventBus } from '../../../../shared/events/IDomainEventBus';
import { User } from '../../domain/entities/User';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { DateTime } from 'luxon';
import type { UpdateUserDTO } from '../../../../shared/validation/schemas';
import type { UserBirthdayChangedEvent } from '../../domain/events/UserBirthdayChanged';
import type { UserTimezoneChangedEvent } from '../../domain/events/UserTimezoneChanged';

describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockEventBus: jest.Mocked<IDomainEventBus>;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUsersWithUpcomingBirthdays: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
    } as jest.Mocked<IDomainEventBus>;

    useCase = new UpdateUserUseCase(mockUserRepository, mockEventBus);
  });

  describe('execute - name updates only', () => {
    it('should update firstName and lastName without publishing events', async () => {
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
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should update only firstName', async () => {
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
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, firstName: 'Jane' }));

      // Act
      const result = await useCase.execute(userId, dto);

      // Assert
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe'); // lastName unchanged
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });
  });

  describe('execute - birthday change events', () => {
    it('should publish UserBirthdayChanged event when dateOfBirth updated', async () => {
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

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, dateOfBirth: newDate }));

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method

      const publishedEvent = mockEventBus.publish.mock.calls[0]?.[0] as UserBirthdayChangedEvent;
      expect(publishedEvent.eventType).toBe('UserBirthdayChanged');
      expect(publishedEvent.context).toBe('user');
      expect(publishedEvent.userId).toBe(userId);
      expect(publishedEvent.aggregateId).toBe(userId);
      expect(publishedEvent.oldDateOfBirth).toBe('1990-01-15');
      expect(publishedEvent.newDateOfBirth).toBe('1990-02-14');
      expect(publishedEvent.timezone).toBe('America/New_York');
      expect(publishedEvent.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should NOT publish UserBirthdayChanged event when dateOfBirth unchanged', async () => {
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
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, firstName: 'Jane' }));

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });
  });

  describe('execute - timezone change events', () => {
    it('should publish UserTimezoneChanged event when timezone updated', async () => {
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

      const dto: UpdateUserDTO = {
        timezone: 'America/Los_Angeles',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, timezone: newTimezone }));

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method

      const publishedEvent = mockEventBus.publish.mock.calls[0]?.[0] as UserTimezoneChangedEvent;
      expect(publishedEvent.eventType).toBe('UserTimezoneChanged');
      expect(publishedEvent.context).toBe('user');
      expect(publishedEvent.userId).toBe(userId);
      expect(publishedEvent.aggregateId).toBe(userId);
      expect(publishedEvent.oldTimezone).toBe('America/New_York');
      expect(publishedEvent.newTimezone).toBe('America/Los_Angeles');
      expect(publishedEvent.dateOfBirth).toBe('1990-01-15');
      expect(publishedEvent.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should NOT publish UserTimezoneChanged event when timezone unchanged', async () => {
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
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, firstName: 'Jane' }));

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });
  });

  describe('execute - combined birthday and timezone changes', () => {
    it('should publish both UserBirthdayChanged and UserTimezoneChanged events', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const oldDate = new DateOfBirth('1990-01-15');
      const newDate = new DateOfBirth('1990-02-14');
      const oldTimezone = new Timezone('America/New_York');
      const newTimezone = new Timezone('America/Los_Angeles');

      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: oldDate,
        timezone: oldTimezone,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
        timezone: 'America/Los_Angeles',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(
        new User({ ...user, dateOfBirth: newDate, timezone: newTimezone })
      );

      // Act
      await useCase.execute(userId, dto);

      // Assert
      expect(mockEventBus.publish).toHaveBeenCalledTimes(2); // eslint-disable-line @typescript-eslint/unbound-method

      const birthdayEvent = mockEventBus.publish.mock.calls[0]?.[0] as UserBirthdayChangedEvent;
      expect(birthdayEvent.eventType).toBe('UserBirthdayChanged');
      expect(birthdayEvent.oldDateOfBirth).toBe('1990-01-15');
      expect(birthdayEvent.newDateOfBirth).toBe('1990-02-14');

      const timezoneEvent = mockEventBus.publish.mock.calls[1]?.[0] as UserTimezoneChangedEvent;
      expect(timezoneEvent.eventType).toBe('UserTimezoneChanged');
      expect(timezoneEvent.oldTimezone).toBe('America/New_York');
      expect(timezoneEvent.newTimezone).toBe('America/Los_Angeles');
    });

    it('should publish both events when all fields updated', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const oldDate = new DateOfBirth('1990-01-15');
      const newDate = new DateOfBirth('1990-02-14');
      const oldTimezone = new Timezone('America/New_York');
      const newTimezone = new Timezone('Europe/London');

      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: oldDate,
        timezone: oldTimezone,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const dto: UpdateUserDTO = {
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1990-02-14',
        timezone: 'Europe/London',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(
        new User({
          ...user,
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: newDate,
          timezone: newTimezone,
        })
      );

      // Act
      const result = await useCase.execute(userId, dto);

      // Assert
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(mockEventBus.publish).toHaveBeenCalledTimes(2); // eslint-disable-line @typescript-eslint/unbound-method
    });
  });

  describe('execute - error handling', () => {
    it('should throw UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: UpdateUserDTO = {
        firstName: 'Jane',
      };

      mockUserRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(userId, dto)).rejects.toThrow('User not found');
    });

    it('should propagate repository errors', async () => {
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
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(useCase.execute(userId, dto)).rejects.toThrow('Database error');
    });

    it('should propagate event bus errors', async () => {
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

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, dateOfBirth: newDate }));
      mockEventBus.publish.mockRejectedValue(new Error('Event bus error'));

      // Act & Assert
      await expect(useCase.execute(userId, dto)).rejects.toThrow('Event bus error');
    });
  });

  describe('execute - edge cases', () => {
    it('should handle partial updates correctly', async () => {
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
        lastName: 'Smith',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(new User({ ...user, lastName: 'Smith' }));

      // Act
      const result = await useCase.execute(userId, dto);

      // Assert
      expect(result.firstName).toBe('John'); // Unchanged
      expect(result.lastName).toBe('Smith');
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should handle empty DTO by returning unchanged user', async () => {
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

      const dto: UpdateUserDTO = {};

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(user);

      // Act
      const result = await useCase.execute(userId, dto);

      // Assert
      expect(result).toBe(user);
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should use new timezone in birthday event when both change', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const oldDate = new DateOfBirth('1990-01-15');
      const newDate = new DateOfBirth('1990-02-14');
      const oldTimezone = new Timezone('America/New_York');
      const newTimezone = new Timezone('Europe/London');

      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: oldDate,
        timezone: oldTimezone,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const dto: UpdateUserDTO = {
        dateOfBirth: '1990-02-14',
        timezone: 'Europe/London',
      };

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(
        new User({ ...user, dateOfBirth: newDate, timezone: newTimezone })
      );

      // Act
      await useCase.execute(userId, dto);

      // Assert
      const birthdayEvent = mockEventBus.publish.mock.calls[0]?.[0] as UserBirthdayChangedEvent;
      // Birthday event should use NEW timezone
      expect(birthdayEvent.timezone).toBe('Europe/London');

      const timezoneEvent = mockEventBus.publish.mock.calls[1]?.[0] as UserTimezoneChangedEvent;
      // Timezone event should include dateOfBirth
      expect(timezoneEvent.dateOfBirth).toBe('1990-02-14');
    });
  });
});
