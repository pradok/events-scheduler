# Port Interfaces (Application Layer Boundaries)

**Defining clean boundaries between application logic and infrastructure**

Reference: [Full Architecture Document](../architecture.md)

---

## Critical Principle

**The domain and application layers have ZERO knowledge of infrastructure technology.** Ports are interfaces that define contracts for infrastructure capabilities WITHOUT specifying implementation details.

---

## Port Interfaces Overview

Ports are defined in `src/application/ports/` and serve as the boundary between the application layer (use cases) and the adapter layer (infrastructure). The **Dependency Inversion Principle** ensures that:

- Application layer depends on port interfaces (abstractions)
- Adapter layer implements port interfaces (concrete implementations)
- Domain layer has NO dependencies on ports (pure business logic)

**Technology Agnostic:** Ports do not mention Prisma, SQS, EventBridge, PostgreSQL, or any specific technology. They describe WHAT needs to happen, not HOW.

---

## IUserRepository Port

**Location:** `src/application/ports/IUserRepository.ts`

**Purpose:** Abstracts user persistence operations. The domain doesn't care if data is stored in PostgreSQL, MongoDB, DynamoDB, or in-memory.

**Interface:**

```typescript
interface IUserRepository {
  // Create new user
  create(user: User): Promise<User>;

  // Find user by unique ID
  findById(userId: string): Promise<User | null>;

  // Find user by email (business requirement for uniqueness)
  findByEmail(email: string): Promise<User | null>;

  // Update existing user
  update(user: User): Promise<User>;

  // Delete user (cascade to events handled by implementation)
  delete(userId: string): Promise<void>;

  // Find all users with birthdays in next N days (for batch processing)
  findUsersWithUpcomingBirthdays(daysAhead: number): Promise<User[]>;
}
```

**Implementation:** `PrismaUserRepository` in `src/adapters/secondary/persistence/`

**Alternative Implementations:**
- `InMemoryUserRepository` (for tests)
- `DynamoDBUserRepository` (future)
- `TypeORMUserRepository` (alternative ORM)

---

## IEventRepository Port

**Location:** `src/application/ports/IEventRepository.ts`

**Purpose:** Abstracts event persistence and querying. The application layer doesn't know about `FOR UPDATE SKIP LOCKED` or PostgreSQL-specific features.

**Interface:**

```typescript
interface IEventRepository {
  // Create new event
  create(event: Event): Promise<Event>;

  // Find event by unique ID
  findById(eventId: string): Promise<Event | null>;

  // Find events by user ID
  findByUserId(userId: string): Promise<Event[]>;

  // Update existing event (optimistic locking handled by implementation)
  update(event: Event): Promise<Event>;

  // Delete event
  delete(eventId: string): Promise<void>;

  // Delete all events for a user (cascade operation)
  deleteByUserId(userId: string): Promise<void>;

  // CRITICAL: Atomically claim ready events for execution
  // Implementation MUST ensure:
  // - Only events with targetTimestampUTC <= now are returned
  // - Only events with status = PENDING are returned
  // - Events are locked to prevent duplicate claiming (race condition protection)
  // - Optimistic locking via version field
  claimReadyEvents(limit: number): Promise<Event[]>;

  // Find events by specification (for complex queries)
  findBySpecification(spec: ISpecification<Event>): Promise<Event[]>;
}
```

**Implementation:** `PrismaEventRepository` in `src/adapters/secondary/persistence/`

**How it abstracts infrastructure:**
- `claimReadyEvents()` doesn't mention `FOR UPDATE SKIP LOCKED` - that's a Prisma implementation detail
- Specification pattern allows complex queries without exposing SQL
- Optimistic locking handled transparently by implementation

---

## IMessageSender Port

**Location:** `src/application/ports/IMessageSender.ts`

**Purpose:** Abstracts asynchronous message queueing. The application layer doesn't care if messages go to SQS, RabbitMQ, Redis Queue, or Kafka.

**Interface:**

```typescript
interface IMessageSender {
  // Send event to queue for asynchronous processing
  // Returns message ID for tracking (opaque string)
  sendEvent(event: Event): Promise<string>;

  // Send batch of events (for efficiency)
  // Returns array of message IDs in same order as input
  sendEventBatch(events: Event[]): Promise<string[]>;
}
```

**Implementation:** `SQSMessageSender` in `src/adapters/secondary/messaging/`

**Alternative Implementations:**
- `RabbitMQMessageSender` (alternative queue)
- `KafkaMessageSender` (alternative message broker)
- `InMemoryQueueSender` (for tests)

**Note:** The port doesn't expose queue names, ARNs, topics, or any infrastructure details. The adapter handles all AWS-specific configuration.

---

## IDeliveryAdapter Port

**Location:** `src/application/ports/IDeliveryAdapter.ts`

**Purpose:** Abstracts message delivery to external systems. The application layer doesn't care if delivery uses HTTP webhooks, SMS, email, or push notifications.

**Interface:**

```typescript
interface IDeliveryAdapter {
  // Deliver event to configured channel
  // Throws DeliveryError for transient failures (retry eligible)
  // Throws PermanentDeliveryError for permanent failures (no retry)
  deliver(event: Event): Promise<DeliveryResult>;
}

interface DeliveryResult {
  success: boolean;
  messageId?: string;        // External system's message ID (for tracking)
  deliveredAt: DateTime;     // Timestamp of successful delivery
  statusCode?: number;       // HTTP status code (if applicable)
  errorMessage?: string;     // Error details for failures
}
```

**Implementations:**
- `WebhookDeliveryAdapter` (Phase 1) - HTTP POST to user-configured URL
- `SNSDeliveryAdapter` (Phase 2+) - AWS SNS for SMS
- `SESDeliveryAdapter` (Phase 2+) - AWS SES for email
- `MockDeliveryAdapter` (tests) - Always succeeds

**Error Handling:**
- Transient errors (5xx, timeout, network) → throw `DeliveryError` → SQS retry
- Permanent errors (4xx, invalid config) → throw `PermanentDeliveryError` → mark failed

---

## Port Usage in Use Cases

**Example: ExecuteEventUseCase**

```typescript
class ExecuteEventUseCase {
  constructor(
    private eventRepository: IEventRepository,      // Port, not Prisma
    private deliveryAdapter: IDeliveryAdapter,      // Port, not Webhook
    private logger: ILogger                         // Port, not Pino
  ) {}

  async execute(eventId: string): Promise<void> {
    // 1. Fetch event (doesn't care if PostgreSQL or DynamoDB)
    const event = await this.eventRepository.findById(eventId);
    if (!event) throw new EventNotFoundError(eventId);

    // 2. Deliver message (doesn't care if webhook, SMS, or email)
    try {
      const result = await this.deliveryAdapter.deliver(event);

      // 3. Mark completed (doesn't care about SQL UPDATE statement)
      event.markCompleted(result.deliveredAt);
      await this.eventRepository.update(event);

    } catch (error) {
      if (error instanceof PermanentDeliveryError) {
        event.markFailed(error.message);
        await this.eventRepository.update(event);
      }
      // Transient errors bubble up to trigger SQS retry
      throw error;
    }
  }
}
```

**Key Points:**
- Use case depends on interfaces, not implementations
- No mention of Prisma, SQS, Axios, or AWS SDK
- Easy to test with mock implementations
- Easy to swap infrastructure (Prisma → TypeORM, SQS → RabbitMQ)

---

## Dependency Injection

Ports are injected into use cases at application startup. The `main.ts` or Lambda handler wires up concrete implementations:

### Production Configuration

```typescript
// src/index.ts (local development)
const prismaClient = new PrismaClient();
const userRepository: IUserRepository = new PrismaUserRepository(prismaClient);
const eventRepository: IEventRepository = new PrismaEventRepository(prismaClient);
const messageSender: IMessageSender = new SQSMessageSender(sqsClient, queueUrl);
const deliveryAdapter: IDeliveryAdapter = new WebhookDeliveryAdapter(axiosClient);

const executeEventUseCase = new ExecuteEventUseCase(
  eventRepository,
  deliveryAdapter,
  logger
);
```

### Test Configuration

```typescript
// ExecuteEventUseCase.test.ts
const mockEventRepo = new InMemoryEventRepository();
const mockDelivery = new MockDeliveryAdapter();
const mockLogger = new MockLogger();

const useCase = new ExecuteEventUseCase(
  mockEventRepo,
  mockDelivery,
  mockLogger
);
```

**Benefits:**
- Zero infrastructure dependencies in tests
- Fast unit tests (no database, no network)
- Easy to test error scenarios (mock failures)
- Swap infrastructure without changing business logic

---

## Implementation Guidelines

### Rule 1: Ports are Defined in Application Layer

```
src/application/ports/
├── IUserRepository.ts
├── IEventRepository.ts
├── IMessageSender.ts
└── IDeliveryAdapter.ts
```

**Never** define ports in the adapter layer or domain layer.

### Rule 2: Adapters Implement Ports

```typescript
// ✅ CORRECT
class PrismaEventRepository implements IEventRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<Event | null> {
    const record = await this.prisma.event.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }
}

// ❌ WRONG - Use case importing Prisma directly
class ExecuteEventUseCase {
  constructor(private prisma: PrismaClient) {} // NO!
}
```

### Rule 3: Domain Layer Has No Knowledge of Ports

```typescript
// ✅ CORRECT - Domain entity with pure business logic
class Event {
  markCompleted(executedAt: DateTime): void {
    this.status = EventStatus.COMPLETED;
    this.executedAt = executedAt;
  }
}

// ❌ WRONG - Domain importing repository
class Event {
  constructor(private repository: IEventRepository) {} // NO!
}
```

### Rule 4: Use Cases Depend Only on Port Interfaces

```typescript
// ✅ CORRECT
class ClaimReadyEventsUseCase {
  constructor(
    private eventRepository: IEventRepository,  // Interface
    private messageSender: IMessageSender       // Interface
  ) {}
}

// ❌ WRONG
class ClaimReadyEventsUseCase {
  constructor(
    private eventRepository: PrismaEventRepository,  // Concrete class
    private messageSender: SQSMessageSender          // Concrete class
  ) {}
}
```

---

## Testing with Ports

### In-Memory Repository Example

```typescript
class InMemoryEventRepository implements IEventRepository {
  private events: Map<string, Event> = new Map();

  async create(event: Event): Promise<Event> {
    this.events.set(event.id, event);
    return event;
  }

  async findById(id: string): Promise<Event | null> {
    return this.events.get(id) || null;
  }

  async claimReadyEvents(limit: number): Promise<Event[]> {
    const now = DateTime.now();
    return Array.from(this.events.values())
      .filter(e => e.status === EventStatus.PENDING && e.targetTimestampUTC <= now)
      .slice(0, limit);
  }

  // ... other methods
}
```

### Mock Delivery Adapter Example

```typescript
class MockDeliveryAdapter implements IDeliveryAdapter {
  public deliveryCalls: Event[] = [];
  public shouldFail = false;

  async deliver(event: Event): Promise<DeliveryResult> {
    this.deliveryCalls.push(event);

    if (this.shouldFail) {
      throw new DeliveryError('Mock delivery failure');
    }

    return {
      success: true,
      messageId: 'mock-message-id',
      deliveredAt: DateTime.now(),
      statusCode: 200
    };
  }
}
```

### Test Usage

```typescript
describe('ExecuteEventUseCase', () => {
  let useCase: ExecuteEventUseCase;
  let mockRepo: InMemoryEventRepository;
  let mockDelivery: MockDeliveryAdapter;

  beforeEach(() => {
    mockRepo = new InMemoryEventRepository();
    mockDelivery = new MockDeliveryAdapter();
    useCase = new ExecuteEventUseCase(mockRepo, mockDelivery, mockLogger);
  });

  it('should deliver event and mark completed', async () => {
    const event = new EventBuilder().thatIsReady().build();
    await mockRepo.create(event);

    await useCase.execute(event.id);

    expect(mockDelivery.deliveryCalls).toHaveLength(1);
    const updated = await mockRepo.findById(event.id);
    expect(updated.status).toBe(EventStatus.COMPLETED);
  });
});
```

---
