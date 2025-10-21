import { IEventHandler } from './IEventHandler';

/**
 * UnsupportedEventTypeError - Thrown when an unregistered event type is requested
 */
export class UnsupportedEventTypeError extends Error {
  public constructor(eventType: string) {
    super(`Unsupported event type: ${eventType}`);
    this.name = 'UnsupportedEventTypeError';
  }
}

/**
 * EventHandlerRegistry - Registry for event type handlers (Strategy Pattern)
 *
 * Maintains a mapping of event types to their handlers, enabling the system
 * to support multiple event types without modifying core logic.
 *
 * This follows the Strategy Pattern where each handler encapsulates the
 * algorithm for a specific event type.
 */
export class EventHandlerRegistry {
  private handlers: Map<string, IEventHandler> = new Map();

  /**
   * Register an event handler for a specific event type
   *
   * @param handler - The event handler to register
   * @throws Error if handler with same eventType already registered
   */
  public register(handler: IEventHandler): void {
    if (this.handlers.has(handler.eventType)) {
      throw new Error(`Event handler for type "${handler.eventType}" is already registered`);
    }
    this.handlers.set(handler.eventType, handler);
  }

  /**
   * Retrieve the handler for a specific event type
   *
   * @param eventType - The event type identifier
   * @returns The registered event handler
   * @throws UnsupportedEventTypeError if no handler registered for this type
   */
  public getHandler(eventType: string): IEventHandler {
    const handler = this.handlers.get(eventType);
    if (!handler) {
      throw new UnsupportedEventTypeError(eventType);
    }
    return handler;
  }

  /**
   * Get all supported event types
   *
   * @returns Array of registered event type identifiers
   */
  public getSupportedEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if an event type is supported
   *
   * @param eventType - The event type to check
   * @returns True if handler is registered for this type
   */
  public isSupported(eventType: string): boolean {
    return this.handlers.has(eventType);
  }

  /**
   * Clear all registered handlers (primarily for testing)
   */
  public clear(): void {
    this.handlers.clear();
  }
}
