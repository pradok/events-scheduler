import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../../../__tests__/integration/helpers/testDatabase';
import { PrismaUserRepository } from './PrismaUserRepository';
import { User } from '../../domain/entities/User';
import { DateOfBirth } from '../../domain/value-objects/DateOfBirth';
import { Timezone } from '@shared/value-objects/Timezone';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';

describe('PrismaUserRepository - Integration Tests', () => {
  let prisma: PrismaClient;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    prisma = await startTestDatabase();
    repository = new PrismaUserRepository(prisma);
  }, 60000); // 60s timeout for container startup

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('create()', () => {
    it('should persist user and return with generated ID', async () => {
      // Arrange
      const userId = randomUUID();
      const user = new User({
        id: userId,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: DateOfBirth.fromString('1990-05-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act
      const createdUser = await repository.create(user);

      // Assert
      expect(createdUser).toBeInstanceOf(User);
      expect(createdUser.id).toBe(userId);
      expect(createdUser.firstName).toBe('John');
      expect(createdUser.lastName).toBe('Doe');
      expect(createdUser.dateOfBirth.toString()).toBe('1990-05-15');
      expect(createdUser.timezone.toString()).toBe('America/New_York');
      expect(createdUser.createdAt).toBeInstanceOf(DateTime);
      expect(createdUser.updatedAt).toBeInstanceOf(DateTime);

      // Verify persisted in database
      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.firstName).toBe('John');
    });
  });

  describe('findById()', () => {
    it('should return user when exists', async () => {
      // Arrange - create user directly in database
      const userId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: new Date('1985-03-20'),
          timezone: 'Europe/London',
        },
      });

      // Act
      const foundUser = await repository.findById(userId);

      // Assert
      expect(foundUser).toBeInstanceOf(User);
      expect(foundUser?.id).toBe(userId);
      expect(foundUser?.firstName).toBe('Jane');
      expect(foundUser?.lastName).toBe('Smith');
      expect(foundUser?.dateOfBirth.toString()).toBe('1985-03-20');
      expect(foundUser?.timezone.toString()).toBe('Europe/London');
    });

    it('should return null when not exists', async () => {
      // Act
      const foundUser = await repository.findById(randomUUID());

      // Assert
      expect(foundUser).toBeNull();
    });
  });

  describe('findByEmail()', () => {
    it('should return null when email field not in schema', async () => {
      // Act
      const foundUser = await repository.findByEmail('test@example.com');

      // Assert
      expect(foundUser).toBeNull();
    });
  });

  describe('findUsersWithUpcomingBirthdays()', () => {
    it('should return users with birthdays in next N days', async () => {
      // Arrange - create users with birthdays
      const today = DateTime.now();
      const tomorrow = today.plus({ days: 1 });
      const nextWeek = today.plus({ days: 7 });
      const lastMonth = today.minus({ months: 1 });

      const userIdTomorrow = randomUUID();
      const userIdNextWeek = randomUUID();
      const userIdLastMonth = randomUUID();

      await prisma.user.createMany({
        data: [
          {
            id: userIdTomorrow,
            firstName: 'Tomorrow',
            lastName: 'User',
            dateOfBirth: new Date(
              `1990-${String(tomorrow.month).padStart(2, '0')}-${String(tomorrow.day).padStart(2, '0')}`
            ),
            timezone: 'America/New_York',
          },
          {
            id: userIdNextWeek,
            firstName: 'NextWeek',
            lastName: 'User',
            dateOfBirth: new Date(
              `1995-${String(nextWeek.month).padStart(2, '0')}-${String(nextWeek.day).padStart(2, '0')}`
            ),
            timezone: 'America/New_York',
          },
          {
            id: userIdLastMonth,
            firstName: 'LastMonth',
            lastName: 'User',
            dateOfBirth: new Date(
              `1988-${String(lastMonth.month).padStart(2, '0')}-${String(lastMonth.day).padStart(2, '0')}`
            ),
            timezone: 'America/New_York',
          },
        ],
      });

      // Act - find birthdays in next 7 days
      const users = await repository.findUsersWithUpcomingBirthdays(7);

      // Assert
      expect(users.length).toBeGreaterThanOrEqual(1); // At least tomorrow's birthday
      expect(users.length).toBeLessThanOrEqual(2); // At most tomorrow + next week
      expect(users.some((u) => u.id === userIdTomorrow)).toBe(true);
      expect(users.some((u) => u.id === userIdLastMonth)).toBe(false);
    });
  });

  describe('update()', () => {
    it('should update user fields', async () => {
      // Arrange - create user
      const userId = randomUUID();
      const originalUser = new User({
        id: userId,
        firstName: 'Original',
        lastName: 'Name',
        dateOfBirth: DateOfBirth.fromString('1990-01-01'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      await repository.create(originalUser);

      // Act - update user
      const updatedUser = originalUser.updateName('Updated', 'Name');
      const result = await repository.update(updatedUser);

      // Assert
      expect(result.firstName).toBe('Updated');
      expect(result.lastName).toBe('Name');

      // Verify in database
      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(dbUser?.firstName).toBe('Updated');
      expect(dbUser?.lastName).toBe('Name');
    });
  });

  describe('delete()', () => {
    it('should remove user and cascade delete events', async () => {
      // Arrange - create user with event
      const userId = randomUUID();
      const eventId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          firstName: 'Delete',
          lastName: 'Me',
          dateOfBirth: new Date('1990-01-01'),
          timezone: 'America/New_York',
          events: {
            create: {
              id: eventId,
              eventType: 'BIRTHDAY',
              status: 'PENDING',
              targetTimestampUTC: new Date(),
              targetTimestampLocal: new Date(),
              targetTimezone: 'America/New_York',
              idempotencyKey: `test-key-${randomUUID()}`,
              deliveryPayload: { message: 'Happy Birthday!' },
            },
          },
        },
      });

      // Act
      await repository.delete(userId);

      // Assert
      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(dbUser).toBeNull();

      // Verify events were cascade deleted
      const dbEvent = await prisma.event.findUnique({ where: { id: eventId } });
      expect(dbEvent).toBeNull();
    });
  });
});
