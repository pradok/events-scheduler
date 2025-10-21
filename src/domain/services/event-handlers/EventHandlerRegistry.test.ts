import { EventHandlerRegistry, UnsupportedEventTypeError } from './EventHandlerRegistry';
import { IEventHandler } from './IEventHandler';
import { User } from '../../entities/User';
import { Event } from '../../entities/Event';
import { DateTime } from 'luxon';

// Mock event handler for testing
class MockEventHandler implements IEventHandler {
  public constructor(public readonly eventType: string) {}

  public calculateNextOccurrence(_user: User, _referenceDate?: DateTime): DateTime {
    return DateTime.now().plus({ days: 1 });
  }

  public formatMessage(user: User): string {
    return `Mock message for ${user.firstName}`;
  }

  public generateEvent(_user: User): Event {
    throw new Error('Not implemented in mock');
  }
}

describe('EventHandlerRegistry', () => {
  let registry: EventHandlerRegistry;

  beforeEach(() => {
    registry = new EventHandlerRegistry();
  });

  describe('register', () => {
    it('should register a new event handler', () => {
      // Arrange
      const handler = new MockEventHandler('BIRTHDAY');

      // Act
      registry.register(handler);

      // Assert
      expect(registry.isSupported('BIRTHDAY')).toBe(true);
    });

    it('should throw error when registering duplicate event type', () => {
      // Arrange
      const handler1 = new MockEventHandler('BIRTHDAY');
      const handler2 = new MockEventHandler('BIRTHDAY');
      registry.register(handler1);

      // Act & Assert
      expect(() => {
        registry.register(handler2);
      }).toThrow('Event handler for type "BIRTHDAY" is already registered');
    });

    it('should allow registering multiple different event types', () => {
      // Arrange
      const birthdayHandler = new MockEventHandler('BIRTHDAY');
      const anniversaryHandler = new MockEventHandler('ANNIVERSARY');
      const reminderHandler = new MockEventHandler('REMINDER');

      // Act
      registry.register(birthdayHandler);
      registry.register(anniversaryHandler);
      registry.register(reminderHandler);

      // Assert
      expect(registry.getSupportedEventTypes()).toHaveLength(3);
      expect(registry.isSupported('BIRTHDAY')).toBe(true);
      expect(registry.isSupported('ANNIVERSARY')).toBe(true);
      expect(registry.isSupported('REMINDER')).toBe(true);
    });
  });

  describe('getHandler', () => {
    it('should retrieve registered handler by event type', () => {
      // Arrange
      const handler = new MockEventHandler('BIRTHDAY');
      registry.register(handler);

      // Act
      const retrieved = registry.getHandler('BIRTHDAY');

      // Assert
      expect(retrieved).toBe(handler);
      expect(retrieved.eventType).toBe('BIRTHDAY');
    });

    it('should throw UnsupportedEventTypeError for unregistered event type', () => {
      // Arrange - No handlers registered

      // Act & Assert
      expect(() => {
        registry.getHandler('UNKNOWN');
      }).toThrow(UnsupportedEventTypeError);
      expect(() => {
        registry.getHandler('UNKNOWN');
      }).toThrow('Unsupported event type: UNKNOWN');
    });

    it('should retrieve correct handler when multiple types registered', () => {
      // Arrange
      const birthdayHandler = new MockEventHandler('BIRTHDAY');
      const anniversaryHandler = new MockEventHandler('ANNIVERSARY');
      registry.register(birthdayHandler);
      registry.register(anniversaryHandler);

      // Act
      const birthday = registry.getHandler('BIRTHDAY');
      const anniversary = registry.getHandler('ANNIVERSARY');

      // Assert
      expect(birthday).toBe(birthdayHandler);
      expect(anniversary).toBe(anniversaryHandler);
    });
  });

  describe('getSupportedEventTypes', () => {
    it('should return empty array when no handlers registered', () => {
      // Arrange - No handlers

      // Act
      const types = registry.getSupportedEventTypes();

      // Assert
      expect(types).toEqual([]);
    });

    it('should return all registered event types', () => {
      // Arrange
      registry.register(new MockEventHandler('BIRTHDAY'));
      registry.register(new MockEventHandler('ANNIVERSARY'));
      registry.register(new MockEventHandler('REMINDER'));

      // Act
      const types = registry.getSupportedEventTypes();

      // Assert
      expect(types).toHaveLength(3);
      expect(types).toContain('BIRTHDAY');
      expect(types).toContain('ANNIVERSARY');
      expect(types).toContain('REMINDER');
    });
  });

  describe('isSupported', () => {
    it('should return true for registered event type', () => {
      // Arrange
      const handler = new MockEventHandler('BIRTHDAY');
      registry.register(handler);

      // Act & Assert
      expect(registry.isSupported('BIRTHDAY')).toBe(true);
    });

    it('should return false for unregistered event type', () => {
      // Arrange
      const handler = new MockEventHandler('BIRTHDAY');
      registry.register(handler);

      // Act & Assert
      expect(registry.isSupported('ANNIVERSARY')).toBe(false);
      expect(registry.isSupported('UNKNOWN')).toBe(false);
    });

    it('should return false when no handlers registered', () => {
      // Arrange - No handlers

      // Act & Assert
      expect(registry.isSupported('BIRTHDAY')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all registered handlers', () => {
      // Arrange
      registry.register(new MockEventHandler('BIRTHDAY'));
      registry.register(new MockEventHandler('ANNIVERSARY'));
      expect(registry.getSupportedEventTypes()).toHaveLength(2);

      // Act
      registry.clear();

      // Assert
      expect(registry.getSupportedEventTypes()).toHaveLength(0);
      expect(registry.isSupported('BIRTHDAY')).toBe(false);
      expect(registry.isSupported('ANNIVERSARY')).toBe(false);
    });

    it('should allow re-registering after clear', () => {
      // Arrange
      const handler1 = new MockEventHandler('BIRTHDAY');
      registry.register(handler1);
      registry.clear();

      // Act
      const handler2 = new MockEventHandler('BIRTHDAY');
      registry.register(handler2);

      // Assert
      expect(registry.isSupported('BIRTHDAY')).toBe(true);
      expect(registry.getHandler('BIRTHDAY')).toBe(handler2);
    });
  });

  describe('UnsupportedEventTypeError', () => {
    it('should have correct error name', () => {
      // Arrange & Act
      const error = new UnsupportedEventTypeError('TEST');

      // Assert
      expect(error.name).toBe('UnsupportedEventTypeError');
    });

    it('should have descriptive message', () => {
      // Arrange & Act
      const error = new UnsupportedEventTypeError('CUSTOM_TYPE');

      // Assert
      expect(error.message).toBe('Unsupported event type: CUSTOM_TYPE');
    });

    it('should be instance of Error', () => {
      // Arrange & Act
      const error = new UnsupportedEventTypeError('TEST');

      // Assert
      expect(error).toBeInstanceOf(Error);
    });
  });
});
