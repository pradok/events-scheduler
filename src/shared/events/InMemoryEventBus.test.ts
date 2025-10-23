import { DateTime } from 'luxon';
import { InMemoryEventBus } from './InMemoryEventBus';
import { DomainEvent } from './DomainEvent';

/**
 * Test event interface for unit testing
 */
interface TestEvent extends DomainEvent {
  eventType: 'TestEvent';
  context: 'test';
  testData: string;
}

/**
 * Helper function to create test event
 */
function createTestEvent(testData = 'test-data'): TestEvent {
  const now = DateTime.now().toISO();
  return {
    eventType: 'TestEvent',
    context: 'test',
    occurredAt: now ?? '',
    aggregateId: 'test-aggregate-123',
    testData,
  };
}

/**
 * Helper function to create delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('InMemoryEventBus', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  describe('subscribe()', () => {
    it('should register event handler for event type', async () => {
      // Arrange
      const handler = jest.fn().mockResolvedValue(undefined);

      // Act
      eventBus.subscribe('TestEvent', handler);
      await eventBus.publish(createTestEvent());

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should register multiple handlers for same event type', async () => {
      // Arrange
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);
      const handler3 = jest.fn().mockResolvedValue(undefined);

      // Act
      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);
      eventBus.subscribe('TestEvent', handler3);
      await eventBus.publish(createTestEvent());

      // Assert
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish()', () => {
    it('should publish event to all registered handlers', async () => {
      // Arrange
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);
      const testEvent = createTestEvent('test-payload');

      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);

      // Act
      await eventBus.publish(testEvent);

      // Assert
      expect(handler1).toHaveBeenCalledWith(testEvent);
      expect(handler2).toHaveBeenCalledWith(testEvent);
    });

    it('should pass correct event payload to handlers', async () => {
      // Arrange
      const handler = jest.fn().mockResolvedValue(undefined);
      const testEvent = createTestEvent('specific-test-data');

      eventBus.subscribe('TestEvent', handler);

      // Act
      await eventBus.publish(testEvent);

      // Assert
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'TestEvent',
          context: 'test',
          testData: 'specific-test-data',
          aggregateId: 'test-aggregate-123',
        })
      );
    });

    it('should execute handlers sequentially (not parallel)', async () => {
      // Arrange
      const executionOrder: number[] = [];

      eventBus.subscribe('TestEvent', async () => {
        await delay(20); // Longer delay
        executionOrder.push(1);
      });

      eventBus.subscribe('TestEvent', async () => {
        await delay(5); // Shorter delay
        executionOrder.push(2);
      });

      eventBus.subscribe('TestEvent', () => {
        executionOrder.push(3); // No delay
        return Promise.resolve();
      });

      // Act
      await eventBus.publish(createTestEvent());

      // Assert - If parallel, order would be [3, 2, 1]. Sequential guarantees [1, 2, 3]
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should continue processing handlers if one throws error', async () => {
      // Arrange
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockRejectedValue(new Error('Handler 2 failed'));
      const handler3 = jest.fn().mockResolvedValue(undefined);

      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);
      eventBus.subscribe('TestEvent', handler3);

      // Mock console.error to verify error logging
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act
      await eventBus.publish(createTestEvent());

      // Assert
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1); // ✅ Handler 3 executed despite handler 2 failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Domain event handler failed',
        expect.objectContaining({
          eventType: 'TestEvent',
          handlerIndex: 1,
          error: 'Handler 2 failed',
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log error details when handler fails', async () => {
      // Arrange
      const errorMessage = 'Database connection failed';
      const handler = jest.fn().mockRejectedValue(new Error(errorMessage));

      eventBus.subscribe('TestEvent', handler);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act
      await eventBus.publish(createTestEvent());

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Domain event handler failed',
        expect.objectContaining({
          eventType: 'TestEvent',
          context: 'test',
          aggregateId: 'test-aggregate-123',
          handlerIndex: 0,
          totalHandlers: 1,
          error: errorMessage,
          stack: expect.any(String) as string,
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Arrange
      const handler = jest.fn().mockRejectedValue('String error message');

      eventBus.subscribe('TestEvent', handler);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act
      await eventBus.publish(createTestEvent());

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Domain event handler failed',
        expect.objectContaining({
          error: 'String error message',
          stack: undefined, // Non-Error objects don't have stack
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle multiple event types independently', async () => {
      // Arrange
      const userCreatedHandler = jest.fn().mockResolvedValue(undefined);
      const userDeletedHandler = jest.fn().mockResolvedValue(undefined);

      eventBus.subscribe('UserCreated', userCreatedHandler);
      eventBus.subscribe('UserDeleted', userDeletedHandler);

      const now = DateTime.now().toISO();
      const userCreatedEvent: DomainEvent = {
        eventType: 'UserCreated',
        context: 'user',
        occurredAt: now ?? '',
        aggregateId: 'user-123',
      };

      // Act
      await eventBus.publish(userCreatedEvent);

      // Assert
      expect(userCreatedHandler).toHaveBeenCalledTimes(1);
      expect(userDeletedHandler).not.toHaveBeenCalled(); // ✅ Only UserCreated handler called
    });

    it('should do nothing if no handlers registered for event type', async () => {
      // Arrange
      const testEvent = createTestEvent();

      // Act & Assert - Should not throw
      await expect(eventBus.publish(testEvent)).resolves.toBeUndefined();
    });

    it('should handle empty handlers array gracefully', async () => {
      // Arrange
      const handler = jest.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TestEvent', handler);

      // Act - Publish different event type
      const now2 = DateTime.now().toISO();
      const differentEvent: DomainEvent = {
        eventType: 'DifferentEvent',
        context: 'test',
        occurredAt: now2 ?? '',
        aggregateId: 'test-123',
      };

      await eventBus.publish(differentEvent);

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle synchronous exceptions in handlers', async () => {
      // Arrange
      const handler = jest.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      eventBus.subscribe('TestEvent', handler);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act & Assert - Should not throw
      await expect(eventBus.publish(createTestEvent())).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle handlers with different execution times', async () => {
      // Arrange
      const results: string[] = [];

      eventBus.subscribe('TestEvent', async () => {
        await delay(10);
        results.push('handler-1');
      });

      eventBus.subscribe('TestEvent', () => {
        results.push('handler-2'); // No delay
        return Promise.resolve();
      });

      eventBus.subscribe('TestEvent', async () => {
        await delay(5);
        results.push('handler-3');
      });

      // Act
      await eventBus.publish(createTestEvent());

      // Assert - Sequential execution preserves order
      expect(results).toEqual(['handler-1', 'handler-2', 'handler-3']);
    });

    it('should allow same handler to be registered multiple times', async () => {
      // Arrange
      const handler = jest.fn().mockResolvedValue(undefined);

      eventBus.subscribe('TestEvent', handler);
      eventBus.subscribe('TestEvent', handler); // Register same handler twice

      // Act
      await eventBus.publish(createTestEvent());

      // Assert - Handler called twice (once per registration)
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
