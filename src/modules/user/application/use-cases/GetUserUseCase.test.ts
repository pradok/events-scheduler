import { GetUserUseCase } from './GetUserUseCase';
import type { IUserRepository } from '../ports/IUserRepository';
import { User } from '../../domain/entities/User';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { DateTime } from 'luxon';

describe('GetUserUseCase', () => {
  let useCase: GetUserUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUsersWithUpcomingBirthdays: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    useCase = new GetUserUseCase(mockUserRepository);
  });

  describe('execute', () => {
    it('should return user when found', async () => {
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

      // Act
      const result = await useCase.execute(userId);

      // Assert
      expect(result).toBe(user);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
    });

    it('should return null when user not found', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      mockUserRepository.findById.mockResolvedValue(null);

      // Act
      const result = await useCase.execute(userId);

      // Assert
      expect(result).toBeNull();
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
    });

    it('should throw error if repository throws error', async () => {
      // Arrange
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const error = new Error('Database connection failed');
      mockUserRepository.findById.mockRejectedValue(error);

      // Act & Assert
      await expect(useCase.execute(userId)).rejects.toThrow('Database connection failed');
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
    });
  });
});
