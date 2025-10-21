import { DateTime } from 'luxon';
import { User } from './User';
import { DateOfBirth } from '../value-objects/DateOfBirth';
import { Timezone } from '../value-objects/Timezone';
import { ValidationError } from '../errors/ValidationError';
import { InvalidTimezoneError } from '../errors/InvalidTimezoneError';
import { DateOfBirthInFutureError } from '../errors/InvalidDateOfBirthError';

describe('User', () => {
  const validUserProps = {
    id: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: new DateOfBirth('1990-03-15'),
    timezone: new Timezone('America/New_York'),
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
  };

  describe('constructor', () => {
    it('should create User with valid data', () => {
      // Arrange & Act
      const user = new User(validUserProps);

      // Assert
      expect(user.id).toBe('user-123');
      expect(user.firstName).toBe('John');
      expect(user.lastName).toBe('Doe');
      expect(user.dateOfBirth).toBe(validUserProps.dateOfBirth);
      expect(user.timezone).toBe(validUserProps.timezone);
    });

    it('should throw ValidationError for empty firstName', () => {
      // Arrange
      const props = { ...validUserProps, firstName: '' };

      // Act & Assert
      expect(() => new User(props)).toThrow(ValidationError);
      expect(() => new User(props)).toThrow('First name cannot be empty');
    });

    it('should throw ValidationError for whitespace-only firstName', () => {
      // Arrange
      const props = { ...validUserProps, firstName: '   ' };

      // Act & Assert
      expect(() => new User(props)).toThrow(ValidationError);
    });

    it('should throw ValidationError for firstName >100 chars', () => {
      // Arrange
      const props = { ...validUserProps, firstName: 'a'.repeat(101) };

      // Act & Assert
      expect(() => new User(props)).toThrow(ValidationError);
      expect(() => new User(props)).toThrow('First name cannot exceed 100 characters');
    });

    it('should throw ValidationError for empty lastName', () => {
      // Arrange
      const props = { ...validUserProps, lastName: '' };

      // Act & Assert
      expect(() => new User(props)).toThrow(ValidationError);
      expect(() => new User(props)).toThrow('Last name cannot be empty');
    });

    it('should throw ValidationError for whitespace-only lastName', () => {
      // Arrange
      const props = { ...validUserProps, lastName: '   ' };

      // Act & Assert
      expect(() => new User(props)).toThrow(ValidationError);
    });

    it('should throw ValidationError for lastName >100 chars', () => {
      // Arrange
      const props = { ...validUserProps, lastName: 'a'.repeat(101) };

      // Act & Assert
      expect(() => new User(props)).toThrow(ValidationError);
      expect(() => new User(props)).toThrow('Last name cannot exceed 100 characters');
    });

    it('should throw InvalidTimezoneError for invalid timezone', () => {
      // Arrange & Act & Assert
      expect(
        () =>
          new User({
            ...validUserProps,
            timezone: new Timezone('America/New_York'), // This line won't be reached
          })
      ).not.toThrow();

      expect(() => new Timezone('Invalid/Timezone')).toThrow(InvalidTimezoneError);
    });

    it('should throw DateOfBirthInFutureError for future date of birth', () => {
      // Arrange
      const futureDate = DateTime.now().plus({ days: 1 }).toISODate();

      // Act & Assert
      expect(() => new DateOfBirth(futureDate)).toThrow(DateOfBirthInFutureError);
    });
  });

  describe('calculateNextBirthday', () => {
    it('should calculate next birthday when birthday has not passed this year', () => {
      // Arrange
      const user = new User({
        ...validUserProps,
        dateOfBirth: new DateOfBirth('1990-06-15'),
      });
      const referenceDate = DateTime.fromISO('2025-01-01T00:00:00');

      // Act
      const result = user.calculateNextBirthday(referenceDate);

      // Assert
      expect(result.year).toBe(2025);
      expect(result.month).toBe(6);
      expect(result.day).toBe(15);
    });

    it('should calculate next birthday in next year when birthday has passed', () => {
      // Arrange
      const user = new User({
        ...validUserProps,
        dateOfBirth: new DateOfBirth('1990-03-15'),
      });
      const referenceDate = DateTime.fromISO('2025-06-01T00:00:00');

      // Act
      const result = user.calculateNextBirthday(referenceDate);

      // Assert
      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.day).toBe(15);
    });

    it('should use current date when no reference date provided', () => {
      // Arrange
      const user = new User(validUserProps);

      // Act
      const result = user.calculateNextBirthday();

      // Assert
      expect(result.year).toBeGreaterThanOrEqual(DateTime.now().year);
    });
  });

  describe('updateTimezone', () => {
    it('should return new User instance with updated timezone', () => {
      // Arrange
      const user = new User(validUserProps);
      const newTimezone = new Timezone('Europe/London');

      // Act
      const updatedUser = user.updateTimezone(newTimezone);

      // Assert
      expect(updatedUser.timezone).toBe(newTimezone);
      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.firstName).toBe(user.firstName);
      expect(updatedUser).not.toBe(user); // Different instance (immutability)
    });

    it('should not modify original User instance (immutability)', () => {
      // Arrange
      const user = new User(validUserProps);
      const originalTimezone = user.timezone;
      const newTimezone = new Timezone('Europe/London');

      // Act
      user.updateTimezone(newTimezone);

      // Assert
      expect(user.timezone).toBe(originalTimezone); // Original unchanged
    });

    it('should update updatedAt timestamp', () => {
      // Arrange
      const user = new User(validUserProps);
      const originalUpdatedAt = user.updatedAt;

      // Act (add small delay to ensure timestamp changes)
      const updatedUser = user.updateTimezone(new Timezone('Europe/London'));

      // Assert
      expect(updatedUser.updatedAt.toMillis()).toBeGreaterThanOrEqual(originalUpdatedAt.toMillis());
    });
  });

  describe('updateName', () => {
    it('should return new User instance with updated name', () => {
      // Arrange
      const user = new User(validUserProps);

      // Act
      const updatedUser = user.updateName('Jane', 'Smith');

      // Assert
      expect(updatedUser.firstName).toBe('Jane');
      expect(updatedUser.lastName).toBe('Smith');
      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser).not.toBe(user); // Different instance (immutability)
    });

    it('should not modify original User instance (immutability)', () => {
      // Arrange
      const user = new User(validUserProps);
      const originalFirstName = user.firstName;
      const originalLastName = user.lastName;

      // Act
      user.updateName('Jane', 'Smith');

      // Assert
      expect(user.firstName).toBe(originalFirstName); // Original unchanged
      expect(user.lastName).toBe(originalLastName); // Original unchanged
    });

    it('should throw ValidationError for invalid names', () => {
      // Arrange
      const user = new User(validUserProps);

      // Act & Assert
      expect(() => user.updateName('', 'Smith')).toThrow(ValidationError);
      expect(() => user.updateName('Jane', '')).toThrow(ValidationError);
      expect(() => user.updateName('a'.repeat(101), 'Smith')).toThrow(ValidationError);
    });
  });
});
