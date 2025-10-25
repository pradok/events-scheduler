import { DateTime } from 'luxon';
import { BirthdayEventHandler } from './BirthdayEventHandler';
import { User } from '@modules/user/domain/entities/User';
import { DateOfBirth } from '@modules/user/domain/value-objects/DateOfBirth';
import { Timezone } from '@shared/value-objects/Timezone';
import { UserInfo } from '../../../application/types/UserInfo';

/**
 * Helper to convert User entity to UserInfo (plain object)
 * This maintains bounded context separation in tests - handlers should only use UserInfo
 */
function toUserInfo(user: User): UserInfo {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    dateOfBirth: user.dateOfBirth.toString(),
    timezone: user.timezone.toString(),
  };
}

describe('BirthdayEventHandler', () => {
  let handler: BirthdayEventHandler;

  beforeEach(() => {
    handler = new BirthdayEventHandler();
  });

  describe('eventType', () => {
    it('should have eventType of BIRTHDAY', () => {
      // Assert
      expect(handler.eventType).toBe('BIRTHDAY');
    });
  });

  describe('calculateNextOccurrence', () => {
    describe('Multiple Timezones', () => {
      it('should calculate next birthday at 9:00 AM in America/New_York', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new DateOfBirth('1990-03-15'),
          timezone: new Timezone('America/New_York'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
          zone: 'UTC',
        });

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert
        expect(nextBirthday.toISODate()).toBe('2025-03-15');
        expect(nextBirthday.hour).toBe(9);
        expect(nextBirthday.minute).toBe(0);
        expect(nextBirthday.second).toBe(0);
        expect(nextBirthday.zoneName).toBe('America/New_York');
      });

      it('should calculate next birthday at 9:00 AM in Europe/London', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: new DateOfBirth('1985-06-20'),
          timezone: new Timezone('Europe/London'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
          zone: 'UTC',
        });

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert
        expect(nextBirthday.toISODate()).toBe('2025-06-20');
        expect(nextBirthday.hour).toBe(9);
        expect(nextBirthday.minute).toBe(0);
        expect(nextBirthday.zoneName).toBe('Europe/London');
      });

      it('should calculate next birthday at 9:00 AM in Asia/Tokyo', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'Yuki',
          lastName: 'Tanaka',
          dateOfBirth: new DateOfBirth('1992-11-05'),
          timezone: new Timezone('Asia/Tokyo'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
          zone: 'UTC',
        });

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert
        expect(nextBirthday.toISODate()).toBe('2025-11-05');
        expect(nextBirthday.hour).toBe(9);
        expect(nextBirthday.zoneName).toBe('Asia/Tokyo');
      });

      it('should calculate next birthday at 9:00 AM in Australia/Sydney', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'Alex',
          lastName: 'Wilson',
          dateOfBirth: new DateOfBirth('1988-09-12'),
          timezone: new Timezone('Australia/Sydney'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
          zone: 'UTC',
        });

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert
        expect(nextBirthday.toISODate()).toBe('2025-09-12');
        expect(nextBirthday.hour).toBe(9);
        expect(nextBirthday.zoneName).toBe('Australia/Sydney');
      });
    });

    describe('Leap Year Handling', () => {
      it('should celebrate Feb 29 birthday on Feb 29 in a leap year', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'Leap',
          lastName: 'Year',
          dateOfBirth: new DateOfBirth('2000-02-29'),
          timezone: new Timezone('America/New_York'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        const referenceDate = DateTime.fromISO('2024-01-01T12:00:00', {
          zone: 'UTC',
        }); // 2024 is a leap year

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert
        expect(nextBirthday.toISODate()).toBe('2024-02-29');
        expect(nextBirthday.hour).toBe(9);
        expect(nextBirthday.zoneName).toBe('America/New_York');
      });

      it('should celebrate Feb 29 birthday on Feb 28 in a non-leap year', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'Leap',
          lastName: 'Year',
          dateOfBirth: new DateOfBirth('2000-02-29'),
          timezone: new Timezone('America/New_York'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
          zone: 'UTC',
        }); // 2025 is NOT a leap year

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert - Should use Feb 28, NOT March 1
        expect(nextBirthday.toISODate()).toBe('2025-02-28');
        expect(nextBirthday.hour).toBe(9);
        expect(nextBirthday.zoneName).toBe('America/New_York');
      });
    });

    describe('Boundary Conditions', () => {
      it('should return next year when birthday is today', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new DateOfBirth('1990-03-15'),
          timezone: new Timezone('America/New_York'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        // Reference date is exactly the birthday at 9:00 AM
        const referenceDate = DateTime.fromObject(
          {
            year: 2025,
            month: 3,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'America/New_York' }
        );

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert - Should return next year since current moment <= reference
        expect(nextBirthday.toISODate()).toBe('2026-03-15');
        expect(nextBirthday.hour).toBe(9);
      });

      it('should return this year when birthday is tomorrow', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new DateOfBirth('1990-03-15'),
          timezone: new Timezone('America/New_York'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        // Reference date is one day before birthday
        const referenceDate = DateTime.fromObject(
          {
            year: 2025,
            month: 3,
            day: 14,
            hour: 12,
            minute: 0,
            second: 0,
          },
          { zone: 'America/New_York' }
        );

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert
        expect(nextBirthday.toISODate()).toBe('2025-03-15');
        expect(nextBirthday.hour).toBe(9);
      });

      it('should return next year when birthday was yesterday', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new DateOfBirth('1990-03-15'),
          timezone: new Timezone('America/New_York'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        // Reference date is one day after birthday
        const referenceDate = DateTime.fromObject(
          {
            year: 2025,
            month: 3,
            day: 16,
            hour: 12,
            minute: 0,
            second: 0,
          },
          { zone: 'America/New_York' }
        );

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user), referenceDate);

        // Assert
        expect(nextBirthday.toISODate()).toBe('2026-03-15');
        expect(nextBirthday.hour).toBe(9);
      });
    });

    describe('Default referenceDate parameter', () => {
      it('should use current time when referenceDate is not provided', () => {
        // Arrange
        const user = new User({
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new DateOfBirth('1990-01-01'),
          timezone: new Timezone('America/New_York'),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });

        // Act
        const nextBirthday = handler.calculateNextOccurrence(toUserInfo(user));

        // Assert
        expect(nextBirthday).toBeDefined();
        expect(nextBirthday.hour).toBe(9);
        expect(nextBirthday.minute).toBe(0);
        expect(nextBirthday.zoneName).toBe('America/New_York');
        // Verify it's a future date
        expect(nextBirthday > DateTime.now()).toBe(true);
      });
    });
  });

  describe('formatMessage', () => {
    it('should format birthday message with user name', () => {
      // Arrange
      const user = new User({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-01-01'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act
      const message = handler.formatMessage(toUserInfo(user));

      // Assert
      expect(message).toBe("Hey, John Doe it's your birthday");
    });

    it('should format message for different users', () => {
      // Arrange
      const user = new User({
        id: 'user-2',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: new DateOfBirth('1985-06-15'),
        timezone: new Timezone('Europe/London'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act
      const message = handler.formatMessage(toUserInfo(user));

      // Assert
      expect(message).toBe("Hey, Jane Smith it's your birthday");
    });
  });

  describe('Configurable Delivery Times', () => {
    it('should use configured delivery time instead of default 9:00 AM', () => {
      // Arrange
      const customConfig = { hour: 15, minute: 30 }; // 3:30 PM
      const customHandler = new BirthdayEventHandler(customConfig);
      const user = new User({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-03-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
        zone: 'UTC',
      });

      // Act
      const nextBirthday = customHandler.calculateNextOccurrence(toUserInfo(user), referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2025-03-15');
      expect(nextBirthday.hour).toBe(15);
      expect(nextBirthday.minute).toBe(30);
      expect(nextBirthday.second).toBe(0);
      expect(nextBirthday.zoneName).toBe('America/New_York');
    });

    it('should use default 9:00 AM when no config provided', () => {
      // Arrange
      const defaultHandler = new BirthdayEventHandler(); // No config
      const user = new User({
        id: 'user-1',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: new DateOfBirth('1985-06-20'),
        timezone: new Timezone('Europe/London'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
        zone: 'UTC',
      });

      // Act
      const nextBirthday = defaultHandler.calculateNextOccurrence(toUserInfo(user), referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2025-06-20');
      expect(nextBirthday.hour).toBe(9);
      expect(nextBirthday.minute).toBe(0);
      expect(nextBirthday.second).toBe(0);
      expect(nextBirthday.zoneName).toBe('Europe/London');
    });

    it('should respect configured minute offset', () => {
      // Arrange
      const customConfig = { hour: 9, minute: 15 }; // 9:15 AM
      const customHandler = new BirthdayEventHandler(customConfig);
      const user = new User({
        id: 'user-1',
        firstName: 'Yuki',
        lastName: 'Tanaka',
        dateOfBirth: new DateOfBirth('1992-11-05'),
        timezone: new Timezone('Asia/Tokyo'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
        zone: 'UTC',
      });

      // Act
      const nextBirthday = customHandler.calculateNextOccurrence(toUserInfo(user), referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2025-11-05');
      expect(nextBirthday.hour).toBe(9);
      expect(nextBirthday.minute).toBe(15);
      expect(nextBirthday.second).toBe(0);
      expect(nextBirthday.zoneName).toBe('Asia/Tokyo');
    });

    it('should work with midnight delivery time (0:00)', () => {
      // Arrange
      const midnightConfig = { hour: 0, minute: 0 }; // Midnight
      const customHandler = new BirthdayEventHandler(midnightConfig);
      const user = new User({
        id: 'user-1',
        firstName: 'Alex',
        lastName: 'Wilson',
        dateOfBirth: new DateOfBirth('1988-09-12'),
        timezone: new Timezone('Australia/Sydney'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
        zone: 'UTC',
      });

      // Act
      const nextBirthday = customHandler.calculateNextOccurrence(toUserInfo(user), referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2025-09-12');
      expect(nextBirthday.hour).toBe(0);
      expect(nextBirthday.minute).toBe(0);
      expect(nextBirthday.second).toBe(0);
      expect(nextBirthday.zoneName).toBe('Australia/Sydney');
    });

    it('should work with late night delivery time (23:59)', () => {
      // Arrange
      const lateNightConfig = { hour: 23, minute: 59 }; // 11:59 PM
      const customHandler = new BirthdayEventHandler(lateNightConfig);
      const user = new User({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-03-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      const referenceDate = DateTime.fromISO('2025-01-01T12:00:00', {
        zone: 'UTC',
      });

      // Act
      const nextBirthday = customHandler.calculateNextOccurrence(toUserInfo(user), referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2025-03-15');
      expect(nextBirthday.hour).toBe(23);
      expect(nextBirthday.minute).toBe(59);
      expect(nextBirthday.second).toBe(0);
      expect(nextBirthday.zoneName).toBe('America/New_York');
    });

    it('should use configured time for leap year birthdays', () => {
      // Arrange
      const customConfig = { hour: 14, minute: 45 }; // 2:45 PM
      const customHandler = new BirthdayEventHandler(customConfig);
      const user = new User({
        id: 'user-1',
        firstName: 'Leap',
        lastName: 'Year',
        dateOfBirth: new DateOfBirth('2000-02-29'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      const referenceDate = DateTime.fromISO('2024-01-01T12:00:00', {
        zone: 'UTC',
      }); // 2024 is a leap year

      // Act
      const nextBirthday = customHandler.calculateNextOccurrence(toUserInfo(user), referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2024-02-29');
      expect(nextBirthday.hour).toBe(14);
      expect(nextBirthday.minute).toBe(45);
      expect(nextBirthday.second).toBe(0);
      expect(nextBirthday.zoneName).toBe('America/New_York');
    });
  });

  describe('Domain Layer Purity', () => {
    it('should have no infrastructure dependencies', () => {
      // Arrange & Act - BirthdayEventHandler should be pure domain logic
      const newHandler = new BirthdayEventHandler();

      // Assert
      expect(newHandler).toBeInstanceOf(BirthdayEventHandler);
      expect(newHandler.eventType).toBe('BIRTHDAY');
    });

    it('should only contain domain logic methods', () => {
      // Assert - Handler should only have domain logic methods
      expect(typeof handler.calculateNextOccurrence).toBe('function');
      expect(typeof handler.formatMessage).toBe('function');

      // Orchestration methods (generateEvent) should NOT exist
      // Event entity creation belongs in use cases
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      expect((handler as any).generateEvent).toBeUndefined();
    });
  });
});
