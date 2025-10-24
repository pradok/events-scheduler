import { DateTime } from 'luxon';
import { Event } from './Event';
import { EventStatus } from '../value-objects/EventStatus';
import { IdempotencyKey } from '../value-objects/IdempotencyKey';
import { InvalidStateTransitionError } from '../../../../domain/errors/InvalidStateTransitionError';

describe('Event', () => {
  const validEventProps = {
    id: 'event-123',
    userId: 'user-123',
    eventType: 'BIRTHDAY',
    status: EventStatus.PENDING,
    targetTimestampUTC: DateTime.fromISO('2025-03-15T14:00:00Z'),
    targetTimestampLocal: DateTime.fromISO('2025-03-15T09:00:00'),
    targetTimezone: 'America/New_York',
    executedAt: null,
    failureReason: null,
    retryCount: 0,
    version: 1,
    idempotencyKey: IdempotencyKey.generate('user-123', DateTime.fromISO('2025-03-15T14:00:00Z')),
    deliveryPayload: { message: 'Happy Birthday!' },
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
  };

  describe('constructor', () => {
    it('should create Event with valid data', () => {
      // Arrange & Act
      const event = new Event(validEventProps);

      // Assert
      expect(event.id).toBe('event-123');
      expect(event.userId).toBe('user-123');
      expect(event.status).toBe(EventStatus.PENDING);
      expect(event.retryCount).toBe(0);
      expect(event.version).toBe(1);
    });
  });

  describe('claim', () => {
    it('should transition from PENDING to PROCESSING', () => {
      // Arrange
      const event = new Event(validEventProps);

      // Act
      const claimedEvent = event.claim();

      // Assert
      expect(claimedEvent.status).toBe(EventStatus.PROCESSING);
      expect(claimedEvent.version).toBe(2); // Incremented
      expect(claimedEvent).not.toBe(event); // New instance (immutability)
    });

    it('should throw error if status is not PENDING', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
      });

      // Act & Assert
      expect(() => event.claim()).toThrow(InvalidStateTransitionError);
    });

    it('should increment version', () => {
      // Arrange
      const event = new Event(validEventProps);
      const originalVersion = event.version;

      // Act
      const claimedEvent = event.claim();

      // Assert
      expect(claimedEvent.version).toBe(originalVersion + 1);
    });

    it('should not modify original Event (immutability)', () => {
      // Arrange
      const event = new Event(validEventProps);
      const originalStatus = event.status;

      // Act
      event.claim();

      // Assert
      expect(event.status).toBe(originalStatus); // Original unchanged
    });
  });

  describe('markCompleted', () => {
    it('should transition from PROCESSING to COMPLETED', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
      });
      const executedAt = DateTime.now();

      // Act
      const completedEvent = event.markCompleted(executedAt);

      // Assert
      expect(completedEvent.status).toBe(EventStatus.COMPLETED);
      expect(completedEvent.executedAt).toBe(executedAt);
      expect(completedEvent.version).toBe(2); // Incremented
      expect(completedEvent).not.toBe(event); // New instance
    });

    it('should throw error if status is not PROCESSING', () => {
      // Arrange
      const event = new Event(validEventProps); // PENDING
      const executedAt = DateTime.now();

      // Act & Assert
      expect(() => event.markCompleted(executedAt)).toThrow(InvalidStateTransitionError);
    });

    it('should set executedAt timestamp', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
      });
      const executedAt = DateTime.fromISO('2025-03-15T14:05:00Z');

      // Act
      const completedEvent = event.markCompleted(executedAt);

      // Assert
      expect(completedEvent.executedAt).toBe(executedAt);
    });

    it('should not modify original Event (immutability)', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
      });
      const originalStatus = event.status;

      // Act
      event.markCompleted(DateTime.now());

      // Assert
      expect(event.status).toBe(originalStatus); // Original unchanged
    });
  });

  describe('markFailed', () => {
    it('should transition from PROCESSING to FAILED', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
      });

      // Act
      const failedEvent = event.markFailed('Network error');

      // Assert
      expect(failedEvent.status).toBe(EventStatus.FAILED);
      expect(failedEvent.failureReason).toBe('Network error');
      expect(failedEvent.retryCount).toBe(1); // Incremented
      expect(failedEvent.version).toBe(2); // Incremented
      expect(failedEvent).not.toBe(event); // New instance
    });

    it('should throw error if status is not PROCESSING', () => {
      // Arrange
      const event = new Event(validEventProps); // PENDING

      // Act & Assert
      expect(() => event.markFailed('Error')).toThrow(InvalidStateTransitionError);
    });

    it('should increment retryCount', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
        retryCount: 1,
      });

      // Act
      const failedEvent = event.markFailed('Error');

      // Assert
      expect(failedEvent.retryCount).toBe(2);
    });

    it('should set failureReason', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
      });
      const reason = 'Webhook endpoint returned 500';

      // Act
      const failedEvent = event.markFailed(reason);

      // Assert
      expect(failedEvent.failureReason).toBe(reason);
    });

    it('should not modify original Event (immutability)', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
      });
      const originalStatus = event.status;
      const originalRetryCount = event.retryCount;

      // Act
      event.markFailed('Error');

      // Assert
      expect(event.status).toBe(originalStatus); // Original unchanged
      expect(event.retryCount).toBe(originalRetryCount); // Original unchanged
    });
  });

  describe('canRetry', () => {
    it('should return true when retryCount < 3 and status is FAILED', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.FAILED,
        retryCount: 2,
      });

      // Act
      const result = event.canRetry();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when retryCount >= 3', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.FAILED,
        retryCount: 3,
      });

      // Act
      const result = event.canRetry();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when status is not FAILED', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PENDING,
        retryCount: 0,
      });

      // Act
      const result = event.canRetry();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when status is COMPLETED', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.COMPLETED,
        retryCount: 0,
      });

      // Act
      const result = event.canRetry();

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for retryCount = 0, 1, 2 when FAILED', () => {
      // Arrange & Act & Assert
      expect(
        new Event({
          ...validEventProps,
          status: EventStatus.FAILED,
          retryCount: 0,
        }).canRetry()
      ).toBe(true);

      expect(
        new Event({
          ...validEventProps,
          status: EventStatus.FAILED,
          retryCount: 1,
        }).canRetry()
      ).toBe(true);

      expect(
        new Event({
          ...validEventProps,
          status: EventStatus.FAILED,
          retryCount: 2,
        }).canRetry()
      ).toBe(true);
    });
  });

  describe('version increment', () => {
    it('should increment version on all state changes', () => {
      // Arrange
      const event = new Event(validEventProps);

      // Act - claim() increments version
      const claimedEvent = event.claim();
      expect(claimedEvent.version).toBe(2);

      // Act - markCompleted() increments version
      const completedEvent = claimedEvent.markCompleted(DateTime.now());
      expect(completedEvent.version).toBe(3);
    });

    it('should increment version on markFailed', () => {
      // Arrange
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
        version: 5,
      });

      // Act
      const failedEvent = event.markFailed('Error');

      // Assert
      expect(failedEvent.version).toBe(6);
    });
  });

  describe('state machine enforcement - invalid transitions', () => {
    describe('PENDING state invalid transitions', () => {
      it('should throw error when attempting PENDING → COMPLETED', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.PENDING,
        });
        const executedAt = DateTime.now();

        // Act & Assert
        expect(() => event.markCompleted(executedAt)).toThrow(InvalidStateTransitionError);
        expect(() => event.markCompleted(executedAt)).toThrow(
          'Invalid state transition from PENDING to COMPLETED'
        );
      });

      it('should throw error when attempting PENDING → FAILED', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.PENDING,
        });

        // Act & Assert
        expect(() => event.markFailed('Some error')).toThrow(InvalidStateTransitionError);
        expect(() => event.markFailed('Some error')).toThrow(
          'Invalid state transition from PENDING to FAILED'
        );
      });
    });

    describe('PROCESSING state invalid transitions', () => {
      it('should throw error when attempting PROCESSING → PROCESSING (double claim)', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.PROCESSING,
        });

        // Act & Assert
        expect(() => event.claim()).toThrow(InvalidStateTransitionError);
        expect(() => event.claim()).toThrow(
          'Invalid state transition from PROCESSING to PROCESSING'
        );
      });
    });

    describe('COMPLETED state (terminal) - no outbound transitions', () => {
      it('should throw error when attempting COMPLETED → PROCESSING', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.COMPLETED,
          executedAt: DateTime.now(),
        });

        // Act & Assert
        expect(() => event.claim()).toThrow(InvalidStateTransitionError);
        expect(() => event.claim()).toThrow(
          'Invalid state transition from COMPLETED to PROCESSING'
        );
      });

      it('should throw error when attempting COMPLETED → FAILED', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.COMPLETED,
          executedAt: DateTime.now(),
        });

        // Act & Assert
        expect(() => event.markFailed('Error')).toThrow(InvalidStateTransitionError);
        expect(() => event.markFailed('Error')).toThrow(
          'Invalid state transition from COMPLETED to FAILED'
        );
      });

      it('should throw error when attempting COMPLETED → COMPLETED (duplicate complete)', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.COMPLETED,
          executedAt: DateTime.now(),
        });

        // Act & Assert
        expect(() => event.markCompleted(DateTime.now())).toThrow(InvalidStateTransitionError);
        expect(() => event.markCompleted(DateTime.now())).toThrow(
          'Invalid state transition from COMPLETED to COMPLETED'
        );
      });
    });

    describe('FAILED state (terminal) - no outbound transitions', () => {
      it('should throw error when attempting FAILED → PROCESSING', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.FAILED,
          failureReason: 'Previous error',
          retryCount: 3,
        });

        // Act & Assert
        expect(() => event.claim()).toThrow(InvalidStateTransitionError);
        expect(() => event.claim()).toThrow('Invalid state transition from FAILED to PROCESSING');
      });

      it('should throw error when attempting FAILED → COMPLETED', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.FAILED,
          failureReason: 'Previous error',
          retryCount: 3,
        });

        // Act & Assert
        expect(() => event.markCompleted(DateTime.now())).toThrow(InvalidStateTransitionError);
        expect(() => event.markCompleted(DateTime.now())).toThrow(
          'Invalid state transition from FAILED to COMPLETED'
        );
      });

      it('should throw error when attempting FAILED → FAILED (duplicate fail)', () => {
        // Arrange
        const event = new Event({
          ...validEventProps,
          status: EventStatus.FAILED,
          failureReason: 'Previous error',
          retryCount: 3,
        });

        // Act & Assert
        expect(() => event.markFailed('Another error')).toThrow(InvalidStateTransitionError);
        expect(() => event.markFailed('Another error')).toThrow(
          'Invalid state transition from FAILED to FAILED'
        );
      });
    });

    describe('error message clarity', () => {
      it('should provide clear error messages indicating source and target states', () => {
        // Arrange
        const completedEvent = new Event({
          ...validEventProps,
          status: EventStatus.COMPLETED,
          executedAt: DateTime.now(),
        });

        // Act & Assert
        try {
          completedEvent.claim();
          fail('Should have thrown InvalidStateTransitionError');
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidStateTransitionError);
          expect((error as Error).message).toContain('COMPLETED');
          expect((error as Error).message).toContain('PROCESSING');
          expect((error as Error).message).toContain('Invalid state transition');
        }
      });
    });
  });

  describe('idempotency key persistence', () => {
    it('should include idempotency key when event is created', () => {
      // Arrange
      const idempotencyKey = IdempotencyKey.generate(
        'user-123',
        DateTime.fromISO('2025-03-15T14:00:00Z')
      );
      const event = new Event({
        ...validEventProps,
        idempotencyKey,
      });

      // Assert
      expect(event.idempotencyKey).toBe(idempotencyKey);
      expect(event.idempotencyKey.toString()).toBe(idempotencyKey.toString());
    });

    it('should preserve idempotency key when claiming event', () => {
      // Arrange
      const idempotencyKey = IdempotencyKey.generate(
        'user-123',
        DateTime.fromISO('2025-03-15T14:00:00Z')
      );
      const event = new Event({
        ...validEventProps,
        idempotencyKey,
      });

      // Act
      const claimedEvent = event.claim();

      // Assert
      expect(claimedEvent.idempotencyKey.toString()).toBe(idempotencyKey.toString());
      expect(claimedEvent.idempotencyKey.equals(idempotencyKey)).toBe(true);
    });

    it('should preserve idempotency key when marking event completed', () => {
      // Arrange
      const idempotencyKey = IdempotencyKey.generate(
        'user-123',
        DateTime.fromISO('2025-03-15T14:00:00Z')
      );
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
        idempotencyKey,
      });
      const executedAt = DateTime.now();

      // Act
      const completedEvent = event.markCompleted(executedAt);

      // Assert
      expect(completedEvent.idempotencyKey.toString()).toBe(idempotencyKey.toString());
      expect(completedEvent.idempotencyKey.equals(idempotencyKey)).toBe(true);
    });

    it('should preserve idempotency key when marking event failed', () => {
      // Arrange
      const idempotencyKey = IdempotencyKey.generate(
        'user-123',
        DateTime.fromISO('2025-03-15T14:00:00Z')
      );
      const event = new Event({
        ...validEventProps,
        status: EventStatus.PROCESSING,
        idempotencyKey,
      });

      // Act
      const failedEvent = event.markFailed('Network error');

      // Assert
      expect(failedEvent.idempotencyKey.toString()).toBe(idempotencyKey.toString());
      expect(failedEvent.idempotencyKey.equals(idempotencyKey)).toBe(true);
    });

    it('should preserve idempotency key through complete state lifecycle', () => {
      // Arrange
      const idempotencyKey = IdempotencyKey.generate(
        'user-123',
        DateTime.fromISO('2025-03-15T14:00:00Z')
      );
      const event = new Event({
        ...validEventProps,
        idempotencyKey,
      });

      // Act - Go through full lifecycle: PENDING → PROCESSING → COMPLETED
      const claimedEvent = event.claim();
      const completedEvent = claimedEvent.markCompleted(DateTime.now());

      // Assert - Idempotency key unchanged at every step
      expect(event.idempotencyKey.toString()).toBe(idempotencyKey.toString());
      expect(claimedEvent.idempotencyKey.toString()).toBe(idempotencyKey.toString());
      expect(completedEvent.idempotencyKey.toString()).toBe(idempotencyKey.toString());
    });
  });
});
