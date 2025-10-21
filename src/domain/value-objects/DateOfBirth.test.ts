import { DateTime } from 'luxon';
import { DateOfBirth } from './DateOfBirth';
import { Timezone } from './Timezone';
import {
  InvalidDateOfBirthError,
  DateOfBirthInFutureError,
} from '../errors/InvalidDateOfBirthError';

describe('DateOfBirth', () => {
  describe('constructor', () => {
    it('should create DateOfBirth with valid past date', () => {
      // Arrange & Act
      const dob = new DateOfBirth('1990-03-15');

      // Assert
      expect(dob.toString()).toBe('1990-03-15');
    });

    it('should throw DateOfBirthInFutureError for future date', () => {
      // Arrange
      const futureDate = DateTime.now().plus({ days: 1 }).toISODate();

      // Act & Assert
      expect(() => new DateOfBirth(futureDate)).toThrow(DateOfBirthInFutureError);
    });

    it('should throw InvalidDateOfBirthError for invalid date format', () => {
      // Arrange & Act & Assert
      expect(() => new DateOfBirth('invalid-date')).toThrow(InvalidDateOfBirthError);
    });

    it('should throw InvalidDateOfBirthError for empty string', () => {
      // Arrange & Act & Assert
      expect(() => new DateOfBirth('')).toThrow(InvalidDateOfBirthError);
    });
  });

  describe('getMonthDay', () => {
    it('should return correct month and day', () => {
      // Arrange
      const dob = new DateOfBirth('1990-03-15');

      // Act
      const result = dob.getMonthDay();

      // Assert
      expect(result).toEqual({ month: 3, day: 15 });
    });

    it('should return correct month and day for December', () => {
      // Arrange
      const dob = new DateOfBirth('1985-12-25');

      // Act
      const result = dob.getMonthDay();

      // Assert
      expect(result).toEqual({ month: 12, day: 25 });
    });
  });

  describe('calculateNextOccurrence', () => {
    it('should calculate next birthday in same year when birthday has not passed', () => {
      // Arrange
      const dob = new DateOfBirth('1990-06-15');
      const timezone = new Timezone('America/New_York');
      const referenceDate = DateTime.fromISO('2025-01-01T00:00:00');

      // Act
      const result = dob.calculateNextOccurrence(timezone, referenceDate);

      // Assert
      expect(result.year).toBe(2025);
      expect(result.month).toBe(6);
      expect(result.day).toBe(15);
      expect(result.hour).toBe(9); // Default 9am
    });

    it('should calculate next birthday in next year when birthday has passed', () => {
      // Arrange
      const dob = new DateOfBirth('1990-03-15');
      const timezone = new Timezone('America/New_York');
      const referenceDate = DateTime.fromISO('2025-06-01T00:00:00');

      // Act
      const result = dob.calculateNextOccurrence(timezone, referenceDate);

      // Assert
      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.day).toBe(15);
    });

    it('should handle leap year birthday (Feb 29) in non-leap year', () => {
      // Arrange
      const dob = new DateOfBirth('1992-02-29'); // Leap year
      const timezone = new Timezone('America/New_York');
      const referenceDate = DateTime.fromISO('2025-01-01T00:00:00'); // 2025 is not a leap year

      // Act
      const result = dob.calculateNextOccurrence(timezone, referenceDate);

      // Assert
      expect(result.year).toBe(2025);
      expect(result.month).toBe(3); // March
      expect(result.day).toBe(1); // Day 1
    });

    it('should handle leap year birthday in leap year', () => {
      // Arrange
      const dob = new DateOfBirth('1992-02-29');
      const timezone = new Timezone('America/New_York');
      const referenceDate = DateTime.fromISO('2024-01-01T00:00:00'); // 2024 is a leap year

      // Act
      const result = dob.calculateNextOccurrence(timezone, referenceDate);

      // Assert
      expect(result.year).toBe(2024);
      expect(result.month).toBe(2);
      expect(result.day).toBe(29);
    });

    it('should use default current date when referenceDate not provided', () => {
      // Arrange
      const dob = new DateOfBirth('1990-12-31');
      const timezone = new Timezone('UTC');

      // Act
      const result = dob.calculateNextOccurrence(timezone);

      // Assert
      expect(result.month).toBe(12);
      expect(result.day).toBe(31);
      expect(result.year).toBeGreaterThanOrEqual(DateTime.now().year);
    });
  });

  describe('toString', () => {
    it('should return ISO date string', () => {
      // Arrange
      const dob = new DateOfBirth('1990-03-15');

      // Act
      const result = dob.toString();

      // Assert
      expect(result).toBe('1990-03-15');
    });
  });

  describe('equals', () => {
    it('should return true for same dates', () => {
      // Arrange
      const dob1 = new DateOfBirth('1990-03-15');
      const dob2 = new DateOfBirth('1990-03-15');

      // Act
      const result = dob1.equals(dob2);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for different dates', () => {
      // Arrange
      const dob1 = new DateOfBirth('1990-03-15');
      const dob2 = new DateOfBirth('1990-03-16');

      // Act
      const result = dob1.equals(dob2);

      // Assert
      expect(result).toBe(false);
    });
  });
});
