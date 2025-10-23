import { DateTime } from 'luxon';
import { IdempotencyKey } from './IdempotencyKey';

describe('IdempotencyKey', () => {
  describe('generate', () => {
    it('should generate key with correct format', () => {
      // Arrange
      const userId = 'user-123';
      const timestamp = DateTime.fromISO('2025-03-15T14:00:00Z');

      // Act
      const key = IdempotencyKey.generate(userId, timestamp);

      // Assert
      expect(key.toString()).toMatch(/^event-[a-f0-9]{16}$/);
    });

    it('should generate same key for same inputs (deterministic)', () => {
      // Arrange
      const userId = 'user-123';
      const timestamp = DateTime.fromISO('2025-03-15T14:00:00Z');

      // Act
      const key1 = IdempotencyKey.generate(userId, timestamp);
      const key2 = IdempotencyKey.generate(userId, timestamp);

      // Assert
      expect(key1.toString()).toBe(key2.toString());
    });

    it('should generate different keys for different user IDs', () => {
      // Arrange
      const timestamp = DateTime.fromISO('2025-03-15T14:00:00Z');

      // Act
      const key1 = IdempotencyKey.generate('user-123', timestamp);
      const key2 = IdempotencyKey.generate('user-456', timestamp);

      // Assert
      expect(key1.toString()).not.toBe(key2.toString());
    });

    it('should generate different keys for different timestamps', () => {
      // Arrange
      const userId = 'user-123';

      // Act
      const key1 = IdempotencyKey.generate(userId, DateTime.fromISO('2025-03-15T14:00:00Z'));
      const key2 = IdempotencyKey.generate(userId, DateTime.fromISO('2025-03-16T14:00:00Z'));

      // Assert
      expect(key1.toString()).not.toBe(key2.toString());
    });
  });

  describe('toString', () => {
    it('should return the key string', () => {
      // Arrange
      const userId = 'user-123';
      const timestamp = DateTime.fromISO('2025-03-15T14:00:00Z');
      const key = IdempotencyKey.generate(userId, timestamp);

      // Act
      const result = key.toString();

      // Assert
      expect(typeof result).toBe('string');
      expect(result.startsWith('event-')).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for same keys', () => {
      // Arrange
      const userId = 'user-123';
      const timestamp = DateTime.fromISO('2025-03-15T14:00:00Z');
      const key1 = IdempotencyKey.generate(userId, timestamp);
      const key2 = IdempotencyKey.generate(userId, timestamp);

      // Act
      const result = key1.equals(key2);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for different keys', () => {
      // Arrange
      const timestamp = DateTime.fromISO('2025-03-15T14:00:00Z');
      const key1 = IdempotencyKey.generate('user-123', timestamp);
      const key2 = IdempotencyKey.generate('user-456', timestamp);

      // Act
      const result = key1.equals(key2);

      // Assert
      expect(result).toBe(false);
    });
  });
});
