import { DeleteUserUseCase } from './DeleteUserUseCase';
import type { IUserRepository } from '../ports/IUserRepository';
import type { IDomainEventBus } from '../../../../shared/events/IDomainEventBus';
import { User } from '../../domain/entities/User';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { DateTime } from 'luxon';
import type { UserDeletedEvent } from '../../domain/events/UserDeleted';

describe('DeleteUserUseCase', () => {
  let useCase: DeleteUserUseCase;
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

    useCase = new DeleteUserUseCase(mockUserRepository, mockEventBus);
  });

  describe('execute', () => {
    it('should delete user and publish UserDeleted event', async () => {
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

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.delete.mockResolvedValue(undefined);

      // Act
      await useCase.execute(userId);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockUserRepository.delete).toHaveBeenCalledWith(userId); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method

      const publishedEvent = mockEventBus.publish.mock.calls[0]?.[0] as UserDeletedEvent;
      expect(publishedEvent.eventType).toBe('UserDeleted');
      expect(publishedEvent.context).toBe('user');
      expect(publishedEvent.userId).toBe(userId);
      expect(publishedEvent.aggregateId).toBe(userId);
      expect(publishedEvent.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should delete user with no events', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const user = new User({
        id: userId,
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: new DateOfBirth('1995-05-20'),
        timezone: new Timezone('Europe/London'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.delete.mockResolvedValue(undefined);

      // Act
      await useCase.execute(userId);

      // Assert
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method

      const publishedEvent = mockEventBus.publish.mock.calls[0]?.[0] as UserDeletedEvent;
      expect(publishedEvent.eventType).toBe('UserDeleted');
      expect(publishedEvent.userId).toBe(userId);
    });

    it('should throw UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      mockUserRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(userId)).rejects.toThrow('User not found');
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockUserRepository.delete).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should propagate error if user deletion fails', async () => {
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

      const error = new Error('Database connection failed');
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.delete.mockRejectedValue(error);

      // Act & Assert
      await expect(useCase.execute(userId)).rejects.toThrow('Database connection failed');
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventBus.publish).not.toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should propagate error if event bus publish fails', async () => {
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

      const error = new Error('Event bus error');
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.delete.mockResolvedValue(undefined);
      mockEventBus.publish.mockRejectedValue(error);

      // Act & Assert
      await expect(useCase.execute(userId)).rejects.toThrow('Event bus error');
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should publish event after user is deleted', async () => {
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

      const callOrder: string[] = [];

      mockUserRepository.findById.mockResolvedValue(user);
      // eslint-disable-next-line @typescript-eslint/require-await
      mockUserRepository.delete.mockImplementation(async () => {
        callOrder.push('delete');
        return undefined;
      });
      // eslint-disable-next-line @typescript-eslint/require-await
      mockEventBus.publish.mockImplementation(async () => {
        callOrder.push('publish');
      });

      // Act
      await useCase.execute(userId);

      // Assert
      // Event should be published AFTER user is deleted
      expect(callOrder).toEqual(['delete', 'publish']);
    });
  });
});
