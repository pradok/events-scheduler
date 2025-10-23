# Event Handlers vs Use Cases

**Architectural Decision: Keep Event Handlers Thin, Business Logic in Use Cases**

Reference: [Bounded Contexts](./bounded-contexts.md) | [Design Patterns](./design-patterns.md)

---

## Problem Statement

When implementing domain event handlers (e.g., `CreateBirthdayEventOnUserCreatedHandler`), where should the business logic live?

### Two Approaches:

1. **Fat Event Handlers** (❌ Anti-pattern)
   - Event handler contains all orchestration logic
   - Queries repositories, calls services, implements business rules
   - 50-100+ lines of logic inside the handler

2. **Thin Event Handlers + Use Cases** (✅ Recommended)
   - Event handler is a thin adapter (5-10 lines)
   - Use case contains orchestration logic
   - Handler just extracts event data and delegates to use case

---

## Decision: Thin Handlers + Use Cases

**Principle:** Event handlers should be **thin adapters** that delegate to **reusable use cases**.

### Architecture Pattern:

```
┌──────────────────────────────────────────────────────────────┐
│                       Event Bus                               │
│  (Infrastructure - routes domain events to handlers)         │
└────────────────────────┬─────────────────────────────────────┘
                         │ publishes UserCreatedEvent
                         ▼
┌──────────────────────────────────────────────────────────────┐
│          CreateBirthdayEventOnUserCreatedHandler              │
│  (Thin Adapter - 5-10 lines)                                 │
│                                                               │
│  async handle(event: UserCreatedEvent) {                     │
│    await this.createBirthdayEventUseCase.execute({           │
│      userId: event.userId,                                   │
│      dateOfBirth: event.dateOfBirth,                         │
│      timezone: event.timezone,                               │
│      firstName: event.firstName,                             │
│      lastName: event.lastName                                │
│    });                                                        │
│  }                                                            │
└────────────────────────┬─────────────────────────────────────┘
                         │ delegates to
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              CreateBirthdayEventUseCase                       │
│  (Application Layer - orchestrates domain logic)             │
│                                                               │
│  async execute(dto: CreateBirthdayEventDTO) {                │
│    // 1. Create UserInfo                                     │
│    // 2. Get handler from registry                           │
│    // 3. Calculate next birthday                             │
│    // 4. Convert to UTC                                      │
│    // 5. Generate idempotency key                            │
│    // 6. Create Event entity                                 │
│    // 7. Persist to repository                               │
│  }                                                            │
└────────────────────────┬─────────────────────────────────────┘
                         │ uses
                         ▼
┌──────────────────────────────────────────────────────────────┐
│         Domain Services & Repositories                        │
│  • EventHandlerRegistry                                      │
│  • TimezoneService                                           │
│  • IEventRepository                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Rationale

### 1. **Reusability**

**Fat Handler (❌):**
```typescript
// Logic locked inside event handler
// Can ONLY be triggered by publishing domain event
eventBus.publish(new UserCreatedEvent(...));
```

**Thin Handler + Use Case (✅):**
```typescript
// Use case can be called from multiple entry points:

// 1. Event handler (domain events)
eventBus.subscribe('UserCreated', (e) => useCase.execute(e));

// 2. HTTP endpoint (REST API)
app.post('/users/:id/events', (req, res) => {
  await createBirthdayEventUseCase.execute(req.body);
});

// 3. CLI command (admin tools)
program.command('create-event')
  .action(() => useCase.execute(options));

// 4. Scheduled job (batch processing)
cron.schedule('0 0 * * *', () => {
  const users = await userRepo.findAll();
  for (const user of users) {
    await createBirthdayEventUseCase.execute(user);
  }
});

// 5. Migration script
await createBirthdayEventUseCase.execute(migrationData);
```

### 2. **Testability**

**Fat Handler (❌):**
```typescript
describe('CreateBirthdayEventOnUserCreatedHandler', () => {
  it('should create birthday event', async () => {
    // ❌ Must mock event bus
    const mockEventBus = new MockEventBus();

    // ❌ Must construct domain event
    const event = new UserCreatedEvent({...});

    // ❌ Must publish event to test logic
    await mockEventBus.publish(event);

    // ❌ Complex setup, hard to test edge cases
  });
});
```

**Thin Handler + Use Case (✅):**
```typescript
describe('CreateBirthdayEventUseCase', () => {
  it('should create birthday event', async () => {
    // ✅ No event bus needed
    const useCase = new CreateBirthdayEventUseCase(
      mockEventRepo,
      mockTimezoneService,
      mockRegistry
    );

    // ✅ Simple DTO, easy to test
    await useCase.execute({
      userId: 'user-1',
      dateOfBirth: '1990-01-15',
      timezone: 'America/New_York'
    });

    // ✅ Direct assertions
    expect(mockEventRepo.create).toHaveBeenCalledWith(...);
  });
});
```

### 3. **Single Responsibility Principle**

**Fat Handler (❌):**
- Event handler has TWO responsibilities:
  1. Adapting event to internal format (adapter concern)
  2. Orchestrating business logic (application concern)

**Thin Handler + Use Case (✅):**
- Event handler has ONE responsibility:
  - Adapt event payload to use case DTO
- Use case has ONE responsibility:
  - Orchestrate domain logic to fulfill business requirement

### 4. **Event Bus Performance**

**Fat Handler (❌):**
```typescript
// Event bus must wait for ALL orchestration logic
eventBus.publish(event);  // Blocks for 50-100ms
await handler.handle(event); // Queries DB, calls services, etc.
```

**Thin Handler + Use Case (✅):**
```typescript
// Event bus just routes to handler (fast)
eventBus.publish(event);  // Blocks for ~1ms
await handler.handle(event); // Just delegates to use case

// Use case runs independently (can be async if needed)
```

### 5. **Discoverability & Documentation**

**Fat Handler (❌):**
```
src/modules/event-scheduling/application/
├── event-handlers/
│   ├── CreateBirthdayEventOnUserCreatedHandler.ts  (contains logic)
│   └── RescheduleEventsOnUserBirthdayChangedHandler.ts  (contains logic)
└── ports/

❌ Business logic hidden inside event handlers
❌ Not obvious what operations the module supports
```

**Thin Handler + Use Case (✅):**
```
src/modules/event-scheduling/application/
├── use-cases/
│   ├── CreateBirthdayEventUseCase.ts  ✅ Clear business operation
│   ├── RescheduleBirthdayEventsUseCase.ts  ✅ Clear business operation
│   └── DeleteUserEventsUseCase.ts  ✅ Clear business operation
├── event-handlers/
│   ├── CreateBirthdayEventOnUserCreatedHandler.ts  (thin adapter)
│   └── RescheduleEventsOnUserBirthdayChangedHandler.ts  (thin adapter)
└── ports/

✅ Business capabilities clearly visible in use-cases/ folder
✅ Event handlers are clearly just adapters
```

---

## Implementation Guidelines

### ✅ Thin Event Handler (5-10 lines)

```typescript
/**
 * Event handler that reacts to UserCreated events.
 *
 * This is a THIN ADAPTER that delegates to CreateBirthdayEventUseCase.
 * Business logic lives in the use case, not here.
 */
export class CreateBirthdayEventOnUserCreatedHandler {
  public constructor(
    private readonly createBirthdayEventUseCase: CreateBirthdayEventUseCase
  ) {}

  public async handle(event: UserCreatedEvent): Promise<void> {
    try {
      // Adapt event payload to use case DTO
      await this.createBirthdayEventUseCase.execute({
        userId: event.userId,
        firstName: event.firstName,
        lastName: event.lastName,
        dateOfBirth: event.dateOfBirth,
        timezone: event.timezone,
      });
    } catch (error) {
      // Log event context for debugging
      console.error('Failed to create birthday event from UserCreated event', {
        eventType: event.eventType,
        userId: event.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
```

### ✅ Use Case (Contains Orchestration Logic)

```typescript
/**
 * Use case: Create a birthday event for a user
 *
 * Can be triggered by:
 * - Domain event (UserCreated)
 * - HTTP API (POST /users/:id/events)
 * - CLI command
 * - Batch job
 */
export class CreateBirthdayEventUseCase {
  public constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  public async execute(dto: CreateBirthdayEventDTO): Promise<Event> {
    // Validate input
    const validatedDto = CreateBirthdayEventSchema.parse(dto);

    // Step 1: Create UserInfo from DTO
    const userInfo: UserInfo = {
      id: validatedDto.userId,
      firstName: validatedDto.firstName,
      lastName: validatedDto.lastName,
      dateOfBirth: validatedDto.dateOfBirth,
      timezone: validatedDto.timezone,
    };

    // Step 2: Get BirthdayEventHandler from registry
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');

    // Step 3: Calculate next birthday at 9:00 AM local time
    const nextBirthdayLocal = handler.calculateNextOccurrence(userInfo);

    // Step 4: Convert to UTC
    const timezone = new Timezone(validatedDto.timezone);
    const nextBirthdayUTC = this.timezoneService.convertToUTC(nextBirthdayLocal, timezone);

    // Step 5: Generate idempotency key
    const idempotencyKey = IdempotencyKey.generate(validatedDto.userId, nextBirthdayUTC);

    // Step 6: Create Event entity
    const birthdayEvent = new Event({
      id: randomUUID(),
      userId: validatedDto.userId,
      eventType: 'BIRTHDAY',
      status: EventStatus.PENDING,
      targetTimestampUTC: nextBirthdayUTC,
      targetTimestampLocal: nextBirthdayLocal,
      targetTimezone: validatedDto.timezone,
      idempotencyKey,
      deliveryPayload: {
        message: handler.formatMessage(userInfo),
      },
      version: 1,
      retryCount: 0,
      executedAt: null,
      failureReason: null,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });

    // Step 7: Persist Event
    await this.eventRepository.create(birthdayEvent);

    return birthdayEvent;
  }
}
```

### ✅ Use Case DTO

```typescript
// src/modules/event-scheduling/application/dtos/CreateBirthdayEventDTO.ts
export interface CreateBirthdayEventDTO {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;  // ISO 8601 date
  timezone: string;     // IANA timezone
}

// Validation schema (Zod)
export const CreateBirthdayEventSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().refine(isValidISODate),
  timezone: z.string().refine(isValidIANATimezone),
});
```

---

## Migration Strategy

### Current State (Fat Handlers)

```
src/modules/event-scheduling/application/
└── event-handlers/
    ├── CreateBirthdayEventOnUserCreatedHandler.ts  (58 lines - FAT)
    └── RescheduleEventsOnUserBirthdayChangedHandler.ts  (63 lines - FAT)
```

### Target State (Thin Handlers + Use Cases)

```
src/modules/event-scheduling/application/
├── use-cases/
│   ├── CreateBirthdayEventUseCase.ts  (50 lines - orchestration logic)
│   ├── RescheduleBirthdayEventsUseCase.ts  (55 lines - orchestration logic)
│   └── DeleteUserEventsUseCase.ts  (new capability)
├── event-handlers/
│   ├── CreateBirthdayEventOnUserCreatedHandler.ts  (10 lines - thin adapter)
│   ├── RescheduleEventsOnUserBirthdayChangedHandler.ts  (10 lines - thin adapter)
│   └── DeleteUserEventsOnUserDeletedHandler.ts  (10 lines - thin adapter)
└── dtos/
    ├── CreateBirthdayEventDTO.ts
    ├── RescheduleBirthdayEventsDTO.ts
    └── DeleteUserEventsDTO.ts
```

### Refactoring Steps:

1. **Extract Use Case**
   - Move orchestration logic from handler to new use case
   - Create DTO interface and validation schema
   - Keep same business logic (no logic changes)

2. **Slim Down Handler**
   - Handler becomes thin adapter (5-10 lines)
   - Extract event payload to DTO
   - Delegate to use case

3. **Update Tests**
   - Test use case directly (no event bus mocking)
   - Handler tests become integration tests (thin layer)

4. **Add New Entry Points** (Optional)
   - HTTP endpoint for direct API access
   - CLI command for admin operations
   - Expose use case for batch jobs

---

## Examples from Codebase

### ❌ Current: Fat Handler (Anti-pattern)

**File:** `src/modules/event-scheduling/application/event-handlers/RescheduleEventsOnUserBirthdayChangedHandler.ts`

**Lines:** 63 lines of orchestration logic

**Problems:**
- Contains repository queries
- Has filtering logic
- Orchestrates multiple services
- Implements business rules
- Loop logic for batch updates
- Cannot be called without publishing event
- Hard to test (requires event bus mocking)

### ✅ Target: Thin Handler + Use Case

**Handler:** `RescheduleEventsOnUserBirthdayChangedHandler.ts` (10 lines)
```typescript
export class RescheduleEventsOnUserBirthdayChangedHandler {
  constructor(
    private readonly rescheduleEventsUseCase: RescheduleBirthdayEventsUseCase
  ) {}

  async handle(event: UserBirthdayChangedEvent): Promise<void> {
    await this.rescheduleEventsUseCase.execute({
      userId: event.userId,
      newDateOfBirth: event.newDateOfBirth,
      timezone: event.timezone,
    });
  }
}
```

**Use Case:** `RescheduleBirthdayEventsUseCase.ts` (55 lines)
- Contains all orchestration logic
- Can be called from HTTP API, CLI, batch jobs
- Easy to test (no event bus needed)
- Reusable across multiple triggers

---

## When to Use Each Pattern

### Use Thin Handler + Use Case When:

✅ **Logic is reusable** (might be called from API, CLI, batch job)
✅ **Logic is complex** (> 20 lines of orchestration)
✅ **Multiple entry points** needed (event, API, CLI)
✅ **Easy testing** is important (no event bus mocking)
✅ **Business capability** should be discoverable (`use-cases/` folder)

### Use Fat Handler When:

⚠️ **Simple event-specific logic** (< 10 lines, not reusable)
⚠️ **Pure adapter logic** (e.g., sending email notification)
⚠️ **No other entry points** needed (truly event-specific)

**Example of acceptable Fat Handler:**
```typescript
// Acceptable: Simple notification, not reusable
export class SendEmailOnUserCreatedHandler {
  async handle(event: UserCreatedEvent): Promise<void> {
    await this.emailService.send({
      to: event.email,
      subject: 'Welcome!',
      body: `Hi ${event.firstName}, welcome to our app!`
    });
  }
}
```

---

## Benefits Summary

| Aspect | Thin Handlers + Use Cases |
|--------|---------------------------|
| **Reusability** | ✅ Call from event, API, CLI, batch job |
| **Testability** | ✅ No event bus mocking needed |
| **Performance** | ✅ Event bus is lightweight (fast routing) |
| **Discoverability** | ✅ Business capabilities visible in `use-cases/` |
| **Single Responsibility** | ✅ Handler = adapter, Use Case = orchestration |
| **Direct Access** | ✅ Can invoke use case without event bus |
| **API Integration** | ✅ Easy to expose as HTTP endpoint |
| **Documentation** | ✅ Use case name = business capability |

---

## References

- **DDD Event Handlers:** [Martin Fowler - Domain Events](https://martinfowler.com/eaaDev/DomainEvent.html)
- **Use Case Pattern:** [Clean Architecture - Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- **Single Responsibility:** [SOLID Principles](https://en.wikipedia.org/wiki/Single-responsibility_principle)
- **Related Docs:**
  - [Bounded Contexts](./bounded-contexts.md) - Event-driven communication
  - [Design Patterns](./design-patterns.md) - Application layer patterns
  - [Workflows](./workflows.md) - User creation flow

---

**Decision Date:** 2025-01-24
**Status:** Proposed (refactoring in progress)
**Discovered By:** Code review of bounded context violations
**Impact:** All event handlers in `event-scheduling` module
**Next Steps:** Create Story/Task for refactoring fat handlers to thin handlers + use cases
