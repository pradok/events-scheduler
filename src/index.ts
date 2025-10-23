/**
 * Main entry point for the Birthday Event Scheduling System
 *
 * This is a placeholder file for the initial project setup.
 * The actual application logic will be implemented in subsequent stories.
 *
 * Event Bus Wiring (Story 1.9):
 * When application startup is implemented, wire up the event bus as follows:
 *
 * @example
 * ```typescript
 * import { InMemoryEventBus } from './shared/events/InMemoryEventBus';
 * import { CreateBirthdayEventOnUserCreatedHandler } from './modules/event-scheduling/application/event-handlers/CreateBirthdayEventOnUserCreatedHandler';
 * import { PrismaEventRepository } from './modules/event-scheduling/adapters/persistence/PrismaEventRepository';
 * import { TimezoneService } from './modules/event-scheduling/domain/services/TimezoneService';
 * import { EventHandlerRegistry } from './modules/event-scheduling/domain/services/event-handlers/EventHandlerRegistry';
 * import { BirthdayEventHandler } from './modules/event-scheduling/domain/services/event-handlers/BirthdayEventHandler';
 *
 * // Initialize event bus
 * const eventBus = new InMemoryEventBus();
 *
 * // Initialize dependencies
 * const prisma = new PrismaClient();
 * const eventRepository = new PrismaEventRepository(prisma);
 * const timezoneService = new TimezoneService();
 * const eventHandlerRegistry = new EventHandlerRegistry();
 * eventHandlerRegistry.register(new BirthdayEventHandler(timezoneService));
 *
 * // Create handler
 * const handler = new CreateBirthdayEventOnUserCreatedHandler(
 *   eventRepository,
 *   timezoneService,
 *   eventHandlerRegistry
 * );
 *
 * // Wire up handler to event bus
 * eventBus.subscribe('UserCreated', async (event) => {
 *   await handler.handle(event);
 * });
 *
 * // Note: In Phase 2 (microservices), this becomes Lambda event source mapping:
 * // EventBridge rule: UserCreated event → Lambda function → handler.handle()
 * ```
 */

const greeting = 'Birthday Event Scheduling System - Project Setup Complete';

export { greeting };
