import { Timezone } from './Timezone';
import { InvalidTimezoneError } from '../../domain/errors/InvalidTimezoneError';

describe('Timezone', () => {
  describe('constructor', () => {
    it('should create Timezone with valid IANA timezone', () => {
      // Arrange & Act
      const timezone = new Timezone('America/New_York');

      // Assert
      expect(timezone.toString()).toBe('America/New_York');
    });

    it('should create Timezone with Europe/London', () => {
      // Arrange & Act
      const timezone = new Timezone('Europe/London');

      // Assert
      expect(timezone.toString()).toBe('Europe/London');
    });

    it('should create Timezone with Asia/Tokyo', () => {
      // Arrange & Act
      const timezone = new Timezone('Asia/Tokyo');

      // Assert
      expect(timezone.toString()).toBe('Asia/Tokyo');
    });

    it('should throw InvalidTimezoneError for invalid timezone', () => {
      // Arrange & Act & Assert
      expect(() => new Timezone('Invalid/Timezone')).toThrow(InvalidTimezoneError);
    });

    it('should throw InvalidTimezoneError for empty string', () => {
      // Arrange & Act & Assert
      expect(() => new Timezone('')).toThrow(InvalidTimezoneError);
    });
  });

  describe('isValid', () => {
    it('should return true for valid IANA timezones', () => {
      // Arrange & Act & Assert
      expect(Timezone.isValid('America/New_York')).toBe(true);
      expect(Timezone.isValid('Europe/London')).toBe(true);
      expect(Timezone.isValid('Asia/Tokyo')).toBe(true);
      expect(Timezone.isValid('UTC')).toBe(true);
    });

    it('should return false for invalid timezones', () => {
      // Arrange & Act & Assert
      expect(Timezone.isValid('Invalid/Timezone')).toBe(false);
      expect(Timezone.isValid('')).toBe(false);
      expect(Timezone.isValid('NotATimezone')).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the timezone string', () => {
      // Arrange
      const timezone = new Timezone('America/Los_Angeles');

      // Act
      const result = timezone.toString();

      // Assert
      expect(result).toBe('America/Los_Angeles');
    });
  });

  describe('equals', () => {
    it('should return true for same timezones', () => {
      // Arrange
      const tz1 = new Timezone('America/New_York');
      const tz2 = new Timezone('America/New_York');

      // Act
      const result = tz1.equals(tz2);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for different timezones', () => {
      // Arrange
      const tz1 = new Timezone('America/New_York');
      const tz2 = new Timezone('Europe/London');

      // Act
      const result = tz1.equals(tz2);

      // Assert
      expect(result).toBe(false);
    });
  });
});
