import { PrismaClient } from '@prisma/client';
import { InMemoryEventBus } from './InMemoryEventBus';
import { PrismaEventRepository } from '../../modules/event-scheduling/adapters/persistence/PrismaEventRepository';
import { TimezoneService } from '../../modules/event-scheduling/domain/services/TimezoneService';
import { EventHandlerRegistry } from '../../modules/event-scheduling/domain/services/event-handlers/EventHandlerRegistry';
import { BirthdayEventHandler } from '../../modules/event-scheduling/domain/services/event-handlers/BirthdayEventHandler';
import { RescheduleEventsOnUserBirthdayChangedHandler } from '../../modules/event-scheduling/application/event-handlers/RescheduleEventsOnUserBirthdayChangedHandler';
import { RescheduleEventsOnUserTimezoneChangedHandler } from '../../modules/event-scheduling/application/event-handlers/RescheduleEventsOnUserTimezoneChangedHandler';
import { DeleteEventsOnUserDeletedHandler } from '../../modules/event-scheduling/application/event-handlers/DeleteEventsOnUserDeletedHandler';
import { CreateBirthdayEventOnUserCreatedHandler } from '../../modules/event-scheduling/application/event-handlers/CreateBirthdayEventOnUserCreatedHandler';
import { CreateBirthdayEventUseCase } from '../../modules/event-scheduling/application/use-cases/CreateBirthdayEventUseCase';
import { RescheduleBirthdayEventsUseCase } from '../../modules/event-scheduling/application/use-cases/RescheduleBirthdayEventsUseCase';
import { RescheduleEventsOnTimezoneChangeUseCase } from '../../modules/event-scheduling/application/use-cases/RescheduleEventsOnTimezoneChangeUseCase';

/**
 * Factory function to create and configure the event bus with all handlers
 *
 * @param prisma - Prisma client for database access
 * @returns Configured InMemoryEventBus with all event handlers registered
 */
export function createEventBus(prisma: PrismaClient): InMemoryEventBus {
  const eventBus = new InMemoryEventBus();

  // Shared dependencies
  const eventRepository = new PrismaEventRepository(prisma);
  const timezoneService = new TimezoneService();
  const eventHandlerRegistry = new EventHandlerRegistry();
  eventHandlerRegistry.register(new BirthdayEventHandler());

  // Create use cases
  const createBirthdayEventUseCase = new CreateBirthdayEventUseCase(
    eventRepository,
    timezoneService,
    eventHandlerRegistry
  );
  const rescheduleBirthdayEventsUseCase = new RescheduleBirthdayEventsUseCase(
    eventRepository,
    timezoneService,
    eventHandlerRegistry
  );
  const rescheduleEventsOnTimezoneChangeUseCase = new RescheduleEventsOnTimezoneChangeUseCase(
    eventRepository,
    timezoneService
  );

  // Register UserCreated handler (thin adapter)
  const userCreatedHandler = new CreateBirthdayEventOnUserCreatedHandler(
    createBirthdayEventUseCase
  );
  eventBus.subscribe('UserCreated', (event) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    userCreatedHandler.handle(event as any)
  );

  // Register UserBirthdayChanged handler (thin adapter)
  const birthdayChangedHandler = new RescheduleEventsOnUserBirthdayChangedHandler(
    rescheduleBirthdayEventsUseCase
  );
  eventBus.subscribe('UserBirthdayChanged', (event) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    birthdayChangedHandler.handle(event as any)
  );

  // Register UserTimezoneChanged handler (thin adapter)
  const timezoneChangedHandler = new RescheduleEventsOnUserTimezoneChangedHandler(
    rescheduleEventsOnTimezoneChangeUseCase
  );
  eventBus.subscribe('UserTimezoneChanged', (event) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    timezoneChangedHandler.handle(event as any)
  );

  // Register UserDeleted handler
  const userDeletedHandler = new DeleteEventsOnUserDeletedHandler(eventRepository);
  eventBus.subscribe('UserDeleted', (event) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    userDeletedHandler.handle(event as any)
  );

  return eventBus;
}
