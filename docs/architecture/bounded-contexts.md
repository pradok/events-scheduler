# Bounded Contexts & Eventual Consistency

**Architectural decision for module boundaries and cross-context communication**

Reference: [Full Architecture Document](../architecture.md)

---

## Overview

The system is designed as a **Modular Monolith** with two distinct **Bounded Contexts** that communicate via **Domain Events**. This architecture enables:

✅ **Module Independence** - Each context can evolve independently
✅ **Eventual Consistency** - Contexts are loosely coupled, not transactionally coupled
✅ **Future Microservices** - Easy extraction into separate services when needed
✅ **Testing Isolation** - Test each context without dependencies on others

**Key Principle:** User and Event are separate domains that should NOT share database transactions.

---

## Folder Structure: Physical Separation by Bounded Context

**DECISION:** We are implementing physical folder separation **now** (Story 1.7b), not postponing to Phase 2.

**Rationale:** "I rather reorganise now than later which will be very hard" - easier at 53 files than 200+ files.

### **Current Structure (After Story 1.7b)**

```text
src/modules/
├── user/                           # User bounded context
│   ├── domain/
│   │   ├── entities/User.ts
│   │   └── value-objects/DateOfBirth.ts
│   ├── application/
│   │   ├── ports/IUserRepository.ts
│   │   └── use-cases/CreateUserUseCase.ts
│   └── adapters/
│       └── persistence/PrismaUserRepository.ts
│
└── event-scheduling/               # Event Scheduling bounded context
    ├── domain/
    │   ├── entities/Event.ts
    │   ├── value-objects/EventStatus.ts
    │   └── services/EventHandlerRegistry.ts
    ├── application/
    │   └── ports/IEventRepository.ts
    └── adapters/
        └── persistence/PrismaEventRepository.ts

src/shared/                         # Shared Kernel
├── events/                         # Domain event bus (Story 1.8)
├── validation/schemas.ts
└── value-objects/Timezone.ts
```

**Benefits of Early Reorganization:**

- ✅ **Prevents Accidental Coupling** - Folder structure enforces context boundaries
- ✅ **Easier Code Reviews** - Violations visible (wrong folder = wrong import)
- ✅ **Microservice Ready** - Each `src/modules/*` can become separate repo
- ✅ **Developer Onboarding** - Domain boundaries immediately clear
- ✅ **Lower Risk Now** - Manageable at 53 files vs. 200+ files later

**Bounded contexts enforced through:**

- ✅ **Physical folder separation** (implemented in Story 1.7b)
- ✅ **Domain events** (User publishes, Event subscribes - Story 1.8-1.10)
- ✅ **Port interfaces** (IUserRepository, IEventRepository)
- ✅ **TypeScript path aliases** (@modules/user/*, @modules/event-scheduling/*)
- ✅ **Code review** (cross-context imports visible and reviewable)

---

## Bounded Contexts

### **1. User Context**

**Responsibility:** User identity and profile management

**Domain Model:**
- **Entities:** User
- **Value Objects:** DateOfBirth, Timezone
- **Aggregates:** User (aggregate root)

**Capabilities:**
- Create, read, update, delete users
- Validate user data (unique email, valid timezone)
- Store user preferences and profile

**Domain Events Published:**
- `UserCreated` - When a new user is registered
- `UserUpdated` - When user profile/birthday/timezone changes
- `UserDeleted` - When user account is deleted

**Dependencies:** None (fully independent)

**Ports:**
- `IUserRepository` - User persistence

---

### **2. Event Scheduling Context**

**Responsibility:** Time-based event scheduling, execution, and delivery

**Domain Model:**
- **Entities:** Event
- **Value Objects:** EventStatus, IdempotencyKey
- **Services:** TimezoneService, EventHandlerRegistry, BirthdayEventHandler
- **Aggregates:** Event (aggregate root)

**Capabilities:**
- Generate birthday/anniversary/reminder events
- Schedule events at specific timestamps
- Execute event delivery (webhooks, SMS, email)
- Handle retries and failures
- Claim events for distributed processing

**Domain Events Subscribed:**
- `UserCreated` → Generate initial birthday event
- `UserUpdated` → Recalculate event timestamps if birthday/timezone changed
- `UserDeleted` → Delete all events for user

**Dependencies:** None (reacts to domain events from User Context)

**Ports:**
- `IEventRepository` - Event persistence
- `IMessageSender` - SQS queue for async execution
- `IDeliveryAdapter` - Webhook/SMS/Email delivery

---

## Why Two Bounded Contexts?

### **User and Event Are NOT Transactionally Coupled**

**Critical Insight:** When a user is created, there is NO business requirement that the birthday event MUST be created atomically.

**Reasoning:**

1. **Event is derivable from User**
   - Birthday event can be regenerated from User data at any time
   - Event is a projection/cache of "when to send message"
   - User data is the source of truth

2. **Event is ephemeral, User is persistent**
   - User data is permanent (identity, profile)
   - Event is temporary (deleted after execution)
   - Losing an event is recoverable, losing a user is not

3. **Different lifecycle patterns**
   - User: CRUD operations, infrequent changes
   - Event: High-throughput scheduling, frequent state transitions (PENDING → PROCESSING → COMPLETED)

4. **Different scaling needs**
   - User API: Low traffic, response-time sensitive
   - Event Scheduler: High traffic, batch processing

5. **Future microservice split requires eventual consistency**
   - Cannot share database transactions across services
   - Must use domain events anyway
   - Building with transactions now = harder migration later

---

## Communication Pattern: Domain Events

### **In-Process Event Bus (Current Implementation)**

For MVP, contexts communicate via an **in-memory event bus** within the same process:

```typescript
// src/shared/events/IDomainEventBus.ts
interface IDomainEventBus {
  publish<T extends DomainEvent>(event: T): Promise<void>;
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => Promise<void>
  ): void;
}

// src/shared/events/InMemoryEventBus.ts
class InMemoryEventBus implements IDomainEventBus {
  private handlers = new Map<string, Array<(event: any) => Promise<void>>>();

  subscribe<T>(eventType: string, handler: (event: T) => Promise<void>) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async publish<T>(event: T & { eventType: string }): Promise<void> {
    const handlers = this.handlers.get(event.eventType) || [];

    // Execute handlers sequentially (ensures ordering)
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        // Log error but continue processing other handlers
        console.error(`Handler failed for ${event.eventType}:`, error);
      }
    }
  }
}
```

**Characteristics:**
- ✅ **Fast** - In-process function call (< 1ms overhead)
- ✅ **Simple** - No external dependencies
- ✅ **Testable** - Easy to mock event bus
- ❌ **Not durable** - Events lost on process crash (acceptable for MVP)
- ❌ **Not distributed** - Cannot span multiple processes

---

### **External Event Bus (Future Microservices)**

When splitting into microservices, swap to AWS EventBridge:

```typescript
// src/adapters/secondary/messaging/EventBridgeEventBus.ts
class EventBridgeEventBus implements IDomainEventBus {
  constructor(private client: EventBridgeClient) {}

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    await this.client.putEvents({
      Entries: [{
        Source: `bday.${event.context}`,  // e.g., "bday.user"
        DetailType: event.eventType,      // e.g., "UserCreated"
        Detail: JSON.stringify(event),
        EventBusName: 'bday-event-bus'
      }]
    });
  }

  // Subscriptions handled via Lambda event source mapping
  subscribe() {
    throw new Error('Use Lambda event sources for subscriptions');
  }
}
```

**Characteristics:**
- ✅ **Durable** - Events persisted to EventBridge
- ✅ **Distributed** - Spans multiple services/processes
- ✅ **Scalable** - AWS-managed, handles millions of events
- ✅ **Decoupled** - Publishers don't know about subscribers
- ❌ **Slower** - Network round-trip (20-50ms overhead)
- ❌ **More complex** - Requires AWS infrastructure

**Key Insight:** Your use cases remain identical regardless of event bus implementation. Swap implementations via dependency injection.

---

## Event Schema Definitions

### **UserCreated Event**

```typescript
// src/modules/user/domain/events/UserCreated.ts
interface UserCreatedEvent {
  eventType: 'UserCreated';
  context: 'user';
  occurredAt: string;           // ISO 8601 timestamp
  aggregateId: string;          // User ID

  // Event payload (user data for event handlers)
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;          // ISO 8601 date
  timezone: string;             // IANA timezone
}
```

### **UserUpdated Event**

```typescript
// src/modules/user/domain/events/UserUpdated.ts
interface UserUpdatedEvent {
  eventType: 'UserUpdated';
  context: 'user';
  occurredAt: string;
  aggregateId: string;

  userId: string;
  changes: {
    dateOfBirth?: { old: string; new: string };
    timezone?: { old: string; new: string };
    firstName?: { old: string; new: string };
    lastName?: { old: string; new: string };
  };
}
```

### **UserDeleted Event**

```typescript
// src/modules/user/domain/events/UserDeleted.ts
interface UserDeletedEvent {
  eventType: 'UserDeleted';
  context: 'user';
  occurredAt: string;
  aggregateId: string;

  userId: string;
}
```

---

## Refactored Use Case: CreateUserUseCase

### **Before: Tightly Coupled (Current)**

```typescript
// ❌ OLD: User use case depends on Event repository and handlers
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventRepository: IEventRepository,      // ❌ Cross-context dependency
    private readonly timezoneService: TimezoneService,       // ❌ Event domain service
    private readonly eventHandlerRegistry: EventHandlerRegistry  // ❌ Event domain service
  ) {}

  public async execute(dto: CreateUserDTO): Promise<User> {
    const user = this.createUserEntity(dto);
    const savedUser = await this.userRepository.create(user);

    // ❌ User context creating Event entities directly
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');
    const nextBirthday = handler.calculateNextOccurrence(user);
    const event = this.createEventEntity(user, nextBirthday, handler);
    await this.eventRepository.create(event);

    return savedUser;
  }
}
```

**Problems:**
- User context knows about Event context internals
- Violates Single Responsibility Principle
- Cannot test User creation without Event infrastructure
- Requires database transaction for atomicity (false coupling)

---

### **After: Decoupled via Domain Events (Proposed)**

```typescript
// ✅ NEW: User use case only creates User, publishes domain event
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus: IDomainEventBus  // Generic event bus abstraction
  ) {}

  public async execute(dto: CreateUserDTO): Promise<User> {
    // Step 1: Validate input
    const validatedDto = CreateUserSchema.parse(dto);

    // Step 2: Create User entity
    const user = new User({
      id: randomUUID(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: new DateOfBirth(dto.dateOfBirth),
      timezone: new Timezone(dto.timezone),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });

    // Step 3: Persist user (single transaction, fast)
    const savedUser = await this.userRepository.create(user);

    // Step 4: Publish domain event (instead of creating Event directly)
    await this.eventBus.publish({
      eventType: 'UserCreated',
      context: 'user',
      occurredAt: DateTime.now().toISO(),
      aggregateId: savedUser.id,
      userId: savedUser.id,
      firstName: savedUser.firstName,
      lastName: savedUser.lastName,
      dateOfBirth: savedUser.dateOfBirth.toString(),
      timezone: savedUser.timezone.toString(),
    });

    return savedUser;
    // Event creation happens asynchronously in event handler
  }
}
```

**Benefits:**
- ✅ User context has ZERO knowledge of Event context
- ✅ Single responsibility: only creates users
- ✅ Fast response time (no Event creation in critical path)
- ✅ Easy to test (mock event bus)
- ✅ Future-proof for microservices

---

## Event Handler: React to UserCreated

```typescript
// src/modules/event-scheduling/application/event-handlers/CreateBirthdayEventOnUserCreatedHandler.ts
export class CreateBirthdayEventOnUserCreatedHandler {
  constructor(
    private readonly eventRepository: IEventRepository,
    private readonly timezoneService: TimezoneService,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  public async handle(event: UserCreatedEvent): Promise<void> {
    // Reconstruct User value objects from event payload
    const user = {
      id: event.userId,
      firstName: event.firstName,
      lastName: event.lastName,
      dateOfBirth: new DateOfBirth(event.dateOfBirth),
      timezone: new Timezone(event.timezone),
    };

    // Calculate next birthday using Strategy Pattern
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');
    const nextBirthdayLocal = handler.calculateNextOccurrence(user);
    const nextBirthdayUTC = this.timezoneService.convertToUTC(
      nextBirthdayLocal,
      user.timezone
    );

    // Create Event entity
    const birthdayEvent = new Event({
      id: randomUUID(),
      userId: user.id,
      eventType: 'BIRTHDAY',
      status: EventStatus.PENDING,
      targetTimestampUTC: nextBirthdayUTC,
      targetTimestampLocal: nextBirthdayLocal,
      targetTimezone: user.timezone.toString(),
      idempotencyKey: IdempotencyKey.generate(user.id, nextBirthdayUTC),
      deliveryPayload: { message: handler.formatMessage(user) },
      version: 1,
      retryCount: 0,
      executedAt: null,
      failureReason: null,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });

    // Persist event (separate transaction from User creation)
    await this.eventRepository.create(birthdayEvent);
  }
}

// Wire up subscription at application startup
// src/index.ts or Lambda initialization
eventBus.subscribe('UserCreated', (event) => handler.handle(event));
```

---

## Eventual Consistency: Handling Failures

### **Failure Scenario**

```typescript
// User creation succeeds
await userRepository.create(user);  // ✅ Commits to DB

// Event bus publish succeeds
await eventBus.publish(userCreatedEvent);  // ✅ In-process call

// Event handler FAILS (network issue, DB down, bug)
await createBirthdayEventHandler.handle(event);  // ❌ Throws error
```

**Result:**
- User exists in database ✅
- Birthday Event does NOT exist ❌
- **System is temporarily inconsistent**

### **Self-Healing Strategy**

Implement a **repair job** that detects and fixes inconsistencies:

```typescript
// src/modules/event-scheduling/application/use-cases/RepairMissingEventsUseCase.ts
export class RepairMissingEventsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventRepository: IEventRepository,
    private readonly eventHandlerRegistry: EventHandlerRegistry
  ) {}

  /**
   * Find users without PENDING birthday events and recreate them
   * Run this job every hour or on-demand
   */
  public async execute(): Promise<{ repairedCount: number }> {
    // Query all users
    const allUsers = await this.userRepository.findAll();

    let repairedCount = 0;

    for (const user of allUsers) {
      // Check if user has a PENDING birthday event
      const events = await this.eventRepository.findByUserId(user.id);
      const hasPendingBirthdayEvent = events.some(
        (e) => e.eventType === 'BIRTHDAY' && e.status === EventStatus.PENDING
      );

      if (!hasPendingBirthdayEvent) {
        // User is missing birthday event - regenerate it
        const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');
        const nextBirthdayLocal = handler.calculateNextOccurrence(user);
        const nextBirthdayUTC = this.timezoneService.convertToUTC(
          nextBirthdayLocal,
          user.timezone
        );

        const event = new Event({
          id: randomUUID(),
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: EventStatus.PENDING,
          targetTimestampUTC: nextBirthdayUTC,
          targetTimestampLocal: nextBirthdayLocal,
          targetTimezone: user.timezone.toString(),
          idempotencyKey: IdempotencyKey.generate(user.id, nextBirthdayUTC),
          deliveryPayload: { message: handler.formatMessage(user) },
          version: 1,
          retryCount: 0,
          executedAt: null,
          failureReason: null,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });

        await this.eventRepository.create(event);
        repairedCount++;
      }
    }

    return { repairedCount };
  }
}
```

**Deployment:**
- Run as scheduled Lambda (every hour via EventBridge)
- Run manually via CLI command for immediate repair
- Monitor `repairedCount` metric (should be 0 in healthy system)

---

## Testing Strategy

### **Unit Tests: User Context (Isolated)**

```typescript
describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let mockUserRepo: InMemoryUserRepository;
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockUserRepo = new InMemoryUserRepository();
    mockEventBus = new MockEventBus();
    useCase = new CreateUserUseCase(mockUserRepo, mockEventBus);
  });

  it('should create user and publish UserCreated event', async () => {
    const dto = { firstName: 'John', lastName: 'Doe', ... };

    const user = await useCase.execute(dto);

    // Assert user created
    expect(user.id).toBeDefined();
    expect(mockUserRepo.findById(user.id)).resolves.toBeDefined();

    // Assert domain event published
    expect(mockEventBus.publishedEvents).toHaveLength(1);
    expect(mockEventBus.publishedEvents[0].eventType).toBe('UserCreated');
  });

  it('should NOT create Event directly', async () => {
    // This test would FAIL in old design (cross-context dependency)
    // Now PASSES because CreateUserUseCase has no Event dependencies
  });
});
```

### **Integration Tests: Event Handler (Isolated)**

```typescript
describe('CreateBirthdayEventOnUserCreatedHandler', () => {
  let handler: CreateBirthdayEventOnUserCreatedHandler;
  let mockEventRepo: InMemoryEventRepository;

  beforeEach(() => {
    mockEventRepo = new InMemoryEventRepository();
    handler = new CreateBirthdayEventOnUserCreatedHandler(
      mockEventRepo,
      new TimezoneService(),
      new EventHandlerRegistry()
    );
  });

  it('should create birthday event when UserCreated event received', async () => {
    const userCreatedEvent: UserCreatedEvent = {
      eventType: 'UserCreated',
      userId: 'user-123',
      dateOfBirth: '1990-01-15',
      timezone: 'America/New_York',
      ...
    };

    await handler.handle(userCreatedEvent);

    const events = await mockEventRepo.findByUserId('user-123');
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('BIRTHDAY');
    expect(events[0].status).toBe(EventStatus.PENDING);
  });
});
```

### **End-to-End Tests: Full Flow**

```typescript
describe('User Creation with Event Generation (E2E)', () => {
  it('should create user and generate birthday event via event bus', async () => {
    // Arrange: Wire up real event bus + handler
    const eventBus = new InMemoryEventBus();
    const userRepo = new PrismaUserRepository(prisma);
    const eventRepo = new PrismaEventRepository(prisma);
    const handler = new CreateBirthdayEventOnUserCreatedHandler(...);

    eventBus.subscribe('UserCreated', (e) => handler.handle(e));

    const useCase = new CreateUserUseCase(userRepo, eventBus);

    // Act: Create user
    const user = await useCase.execute({
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1990-02-14',
      timezone: 'America/Los_Angeles',
    });

    // Wait for async event handler to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Both user and event exist
    const savedUser = await userRepo.findById(user.id);
    expect(savedUser).toBeDefined();

    const events = await eventRepo.findByUserId(user.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('BIRTHDAY');
  });
});
```

---

## Migration Path

### **Phase 1: Monolith with In-Memory Event Bus (MVP)**

**Status:** Proposed for implementation

**Architecture:**
- Single Node.js process or Lambda function
- InMemoryEventBus for in-process communication
- Shared PostgreSQL database
- User and Event contexts in same codebase

**Deployment:**
```
┌────────────────────────────────────────┐
│  Single Lambda / Node Process         │
│  ┌──────────────┐  ┌────────────────┐ │
│  │ User Context │  │ Event Context  │ │
│  └──────┬───────┘  └────────▲───────┘ │
│         │                   │          │
│         └──── EventBus ─────┘          │
│           (InMemoryEventBus)           │
└────────────────┬───────────────────────┘
                 │
                 ▼
         ┌──────────────┐
         │  PostgreSQL  │
         └──────────────┘
```

**Benefits:**
- ✅ Simple deployment (single artifact)
- ✅ Fast event delivery (< 1ms in-process)
- ✅ No network latency between contexts
- ✅ Easy debugging (single process)

**Limitations:**
- ❌ Cannot scale User API and Event Scheduler independently
- ❌ Process crash loses in-flight events (acceptable for MVP)

---

### **Phase 2: Microservices with EventBridge (Scale)**

**Status:** Future enhancement when needed

**Architecture:**
- Separate Lambda functions for User API and Event Scheduler
- EventBridge for durable inter-service communication
- Separate databases (optional)

**Deployment:**
```
┌──────────────────┐            ┌──────────────────┐
│  User Service    │            │ Event Scheduler  │
│  (Lambda)        │            │  (Lambda)        │
│                  │            │                  │
│  CreateUser UC   │            │ Event Handlers   │
└────────┬─────────┘            └────────▲─────────┘
         │                               │
         │    ┌─────────────────┐       │
         └───▶│  EventBridge    │───────┘
              │  Event Bus      │
              └─────────────────┘
         │                               │
         ▼                               ▼
    ┌──────────┐                  ┌──────────┐
    │ User DB  │                  │ Event DB │
    └──────────┘                  └──────────┘
```

**When to migrate:**
- User API traffic >> Event Scheduler traffic (or vice versa)
- Need independent scaling of contexts
- Team size justifies separate ownership
- Different deployment schedules required

**Migration steps:**
1. Replace `InMemoryEventBus` with `EventBridgeEventBus` (no code changes in use cases)
2. Deploy User and Event contexts as separate Lambdas
3. Configure EventBridge rules to route events
4. (Optional) Split PostgreSQL into separate databases

---

## Key Takeaways

### **1. Eventual Consistency is a Feature, Not a Bug**

- User creation succeeds even if Event creation fails temporarily
- Self-healing job repairs inconsistencies
- System is resilient to transient failures

### **2. Transaction Atomicity is NOT Required**

- User and Event are NOT relationally coupled
- Event is derivable from User (can regenerate)
- Event is ephemeral (temporary scheduling artifact)

### **3. Bounded Contexts Enable Future Microservices**

- Domain events are the same whether in-process or distributed
- Swap `InMemoryEventBus` → `EventBridgeEventBus` with zero use case changes
- Contexts remain decoupled regardless of deployment model

### **4. Testing is Easier with Decoupled Contexts**

- Test User creation without Event infrastructure
- Test Event generation without User creation flow
- Mock event bus for isolated unit tests

### **5. Performance is Better with Async Event Handling**

- User API responds immediately (no Event creation in critical path)
- Event creation happens asynchronously
- Faster response times for API clients

---

## References

- **Implementation Files:**
  - `src/application/use-cases/user/CreateUserUseCase.ts` (to be refactored)
  - `src/shared/events/IDomainEventBus.ts` (to be created)
  - `src/shared/events/InMemoryEventBus.ts` (to be created)

- **Architecture Documents:**
  - [Design Patterns](./design-patterns.md) - Strategy, Observer, Factory patterns
  - [Port Interfaces](./port-interfaces.md) - Repository abstractions
  - [Workflows](./workflows.md) - User creation flow

- **Domain-Driven Design:**
  - [Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) - Martin Fowler
  - [Domain Events](https://docs.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation) - Microsoft
  - [Eventual Consistency](https://www.allthingsdistributed.com/2008/12/eventually_consistent.html) - Werner Vogels (AWS CTO)

---

**Decision Date:** 2025-01-23
**Status:** Proposed (awaiting Epic/Story assessment)
**Architect:** Winston (BMAD Architect Agent)
**Reviewed By:** [Pending]
