import { DeleteUserUseCase } from './DeleteUserUseCase';
import type { IUserRepository } from '../ports/IUserRepository';
import type { IEventRepository } from '../../../event-scheduling/application/ports/IEventRepository';
import { User } from '../../domain/entities/User';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { DateTime } from 'luxon';

describe('DeleteUserUseCase', () => {
  let useCase: DeleteUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockEventRepository: jest.Mocked<IEventRepository>;

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

    useCase = new DeleteUserUseCase(mockUserRepository, mockEventRepository);
  });

  describe('execute', () => {
    it('should delete user and all associated events', async () => {
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
      mockEventRepository.deleteByUserId.mockResolvedValue(undefined);
      mockUserRepository.delete.mockResolvedValue(undefined);

      // Act
      await useCase.execute(userId);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledWith(userId);
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.delete).toHaveBeenCalledWith(userId);
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
      mockEventRepository.deleteByUserId.mockResolvedValue(undefined);
      mockUserRepository.delete.mockResolvedValue(undefined);

      // Act
      await useCase.execute(userId);

      // Assert
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1);
    });

    it('should throw UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      mockUserRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(userId)).rejects.toThrow('User not found');
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.deleteByUserId).not.toHaveBeenCalled();
      expect(mockUserRepository.delete).not.toHaveBeenCalled();
    });

    it('should propagate error if event deletion fails', async () => {
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

      const error = new Error('Database constraint violation');
      mockUserRepository.findById.mockResolvedValue(user);
      mockEventRepository.deleteByUserId.mockRejectedValue(error);

      // Act & Assert
      await expect(useCase.execute(userId)).rejects.toThrow('Database constraint violation');
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.delete).not.toHaveBeenCalled();
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
      mockEventRepository.deleteByUserId.mockResolvedValue(undefined);
      mockUserRepository.delete.mockRejectedValue(error);

      // Act & Assert
      await expect(useCase.execute(userId)).rejects.toThrow('Database connection failed');
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1);
    });
  });
});
