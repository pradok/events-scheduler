import { DateTime } from 'luxon';
import { BirthdayEventHandler } from './BirthdayEventHandler';
import { TimezoneService } from '../TimezoneService';
import { User } from '@modules/user/domain/entities/User';
import { DateOfBirth } from '@modules/user/domain/value-objects/DateOfBirth';
import { Timezone } from '@shared/value-objects/Timezone';
import { EventStatus } from '../../value-objects/EventStatus';

describe('BirthdayEventHandler', () => {
  let handler: BirthdayEventHandler;
  let timezoneService: TimezoneService;

  beforeEach(() => {
    timezoneService = new TimezoneService();
    handler = new BirthdayEventHandler(timezoneService);
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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user, referenceDate);

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
        const nextBirthday = handler.calculateNextOccurrence(user);

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
      const message = handler.formatMessage(user);

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
      const message = handler.formatMessage(user);

      // Assert
      expect(message).toBe("Hey, Jane Smith it's your birthday");
    });
  });

  describe('generateEvent', () => {
    it('should generate a complete birthday Event entity', () => {
      // Arrange
      const user = new User({
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-03-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act
      const event = handler.generateEvent(user);

      // Assert - Event structure
      expect(event).toBeDefined();
      expect(event.userId).toBe('user-123');
      expect(event.eventType).toBe('BIRTHDAY');
      expect(event.status).toBe(EventStatus.PENDING);

      // Assert - Timestamps
      expect(event.targetTimestampLocal.hour).toBe(9);
      expect(event.targetTimestampLocal.minute).toBe(0);
      expect(event.targetTimestampLocal.zoneName).toBe('America/New_York');

      // Assert - UTC conversion
      expect(event.targetTimestampUTC.zoneName).toBe('UTC');

      // Assert - Payload contains message
      expect(event.deliveryPayload.message).toBe("Hey, John Doe it's your birthday");
      expect(event.deliveryPayload.firstName).toBe('John');
      expect(event.deliveryPayload.lastName).toBe('Doe');

      // Assert - Idempotency key
      expect(event.idempotencyKey).toBeDefined();
      expect(event.idempotencyKey.toString()).toBeDefined();
      expect(typeof event.idempotencyKey.toString()).toBe('string');

      // Assert - Versioning
      expect(event.version).toBe(1);
      expect(event.retryCount).toBe(0);
    });

    it('should generate event with future target timestamp', () => {
      // Arrange
      const user = new User({
        id: 'user-1',
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: new DateOfBirth('1990-01-01'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act
      const event = handler.generateEvent(user);

      // Assert - Target timestamp should be in the future
      expect(event.targetTimestampUTC > DateTime.now()).toBe(true);
    });

    it('should generate event with correct UTC conversion during DST', () => {
      // Arrange - User in New York timezone
      const user = new User({
        id: 'user-1',
        firstName: 'Summer',
        lastName: 'Birthday',
        dateOfBirth: new DateOfBirth('1990-07-15'),
        timezone: new Timezone('America/New_York'),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act
      const event = handler.generateEvent(user);

      // Assert - July is EDT (UTC-4), so 9 AM EDT = 1 PM UTC
      if (event.targetTimestampLocal.month === 7) {
        expect(event.targetTimestampLocal.hour).toBe(9);
        expect(event.targetTimestampUTC.hour).toBe(13); // 9 AM EDT = 1 PM UTC
      }
    });

    it('should generate event with leap year birthday handling', () => {
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

      // Act
      const event = handler.generateEvent(user);

      // Assert - Should handle Feb 29 correctly
      expect(event.targetTimestampLocal.month).toBe(2);
      // Day will be 28 or 29 depending on leap year
      expect([28, 29]).toContain(event.targetTimestampLocal.day);
      expect(event.targetTimestampLocal.hour).toBe(9);
    });
  });

  describe('Domain Layer Purity', () => {
    it('should have no infrastructure dependencies', () => {
      // Arrange & Act
      const newHandler = new BirthdayEventHandler(new TimezoneService());

      // Assert
      expect(newHandler).toBeInstanceOf(BirthdayEventHandler);
      expect(newHandler.eventType).toBe('BIRTHDAY');
    });
  });
});
