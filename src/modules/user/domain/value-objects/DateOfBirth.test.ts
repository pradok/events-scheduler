import { DateTime } from 'luxon';
import { DateOfBirth } from './DateOfBirth';
import {
  InvalidDateOfBirthError,
  DateOfBirthInFutureError,
} from '../../../../domain/errors/InvalidDateOfBirthError';

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

    it('should return correct month and day for leap year birthday', () => {
      // Arrange
      const dob = new DateOfBirth('1992-02-29');

      // Act
      const result = dob.getMonthDay();

      // Assert
      expect(result).toEqual({ month: 2, day: 29 });
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
