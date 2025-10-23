import { EventStatus, isValidTransition, validateTransition } from './EventStatus';
import { InvalidStateTransitionError } from '../../../../domain/errors/InvalidStateTransitionError';

describe('EventStatus', () => {
  describe('isValidTransition', () => {
    it('should allow PENDING → PROCESSING', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.PENDING, EventStatus.PROCESSING);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow PROCESSING → COMPLETED', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.PROCESSING, EventStatus.COMPLETED);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow PROCESSING → FAILED', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.PROCESSING, EventStatus.FAILED);

      // Assert
      expect(result).toBe(true);
    });

    it('should not allow PENDING → COMPLETED (skip PROCESSING)', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.PENDING, EventStatus.COMPLETED);

      // Assert
      expect(result).toBe(false);
    });

    it('should not allow PENDING → FAILED (skip PROCESSING)', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.PENDING, EventStatus.FAILED);

      // Assert
      expect(result).toBe(false);
    });

    it('should not allow COMPLETED → PENDING', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.COMPLETED, EventStatus.PENDING);

      // Assert
      expect(result).toBe(false);
    });

    it('should not allow COMPLETED → PROCESSING', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.COMPLETED, EventStatus.PROCESSING);

      // Assert
      expect(result).toBe(false);
    });

    it('should not allow FAILED → PENDING', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.FAILED, EventStatus.PENDING);

      // Assert
      expect(result).toBe(false);
    });

    it('should not allow FAILED → PROCESSING', () => {
      // Arrange & Act
      const result = isValidTransition(EventStatus.FAILED, EventStatus.PROCESSING);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transition', () => {
      // Arrange & Act & Assert
      expect(() => validateTransition(EventStatus.PENDING, EventStatus.PROCESSING)).not.toThrow();
    });

    it('should throw InvalidStateTransitionError for invalid transition', () => {
      // Arrange & Act & Assert
      expect(() => validateTransition(EventStatus.PENDING, EventStatus.COMPLETED)).toThrow(
        InvalidStateTransitionError
      );
    });

    it('should throw with descriptive error message', () => {
      // Arrange & Act & Assert
      expect(() => validateTransition(EventStatus.COMPLETED, EventStatus.PENDING)).toThrow(
        'Invalid state transition from COMPLETED to PENDING'
      );
    });
  });
});
