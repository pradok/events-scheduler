# Design Patterns

**Comprehensive design pattern implementations for extensibility and maintainability**

Reference: [Full Architecture Document](../architecture.md)

---

## Overview

The architecture implements 8 design patterns to ensure clean separation of concerns, extensibility, testability, and scalability:

1. **Strategy Pattern** - Pluggable event type handlers (Birthday, Anniversary, Reminder)
2. **Factory Pattern** - Event creation with complex business logic
3. **Chain of Responsibility** - Composable event validation
4. **Observer Pattern** - Event lifecycle hooks for metrics and logging
5. **Specification Pattern** - Composable query specifications
6. **Builder Pattern** - Fluent test data creation
7. **Template Method** - Abstract execution flow for use cases
8. **Distributed Scheduler Pattern** - Concurrent job claiming with row-level locking

All patterns follow **Domain-Driven Design** principles with zero infrastructure dependencies in domain layer.

**Related Documentation:**

- [Event Handlers vs Use Cases](./event-handlers-vs-use-cases.md) - Architectural pattern for thin event handlers delegating to reusable use cases

---

## 1. Strategy Pattern - Event Type Handlers

**Status: IMPLEMENTED in Story 1.5** ✅

**Implementation Files:**
- `src/domain/services/event-handlers/IEventHandler.ts`
- `src/domain/services/event-handlers/EventHandlerRegistry.ts`
- `src/domain/services/event-handlers/BirthdayEventHandler.ts`

**Purpose:** Enable adding new event types (Anniversary, Reminder, Subscription) without modifying core scheduler or executor logic.

### IEventHandler Interface

```typescript
interface IEventHandler {
  eventType: string; // "BIRTHDAY", "ANNIVERSARY", "REMINDER", etc.

  generateEvent(entity: User): Event;
  formatMessage(event: Event): string;
  selectDeliveryChannel(event: Event): DeliveryChannel;
  calculateNextOccurrence(event: Event): DateTime;
}
```

### Event Handler Registry

```typescript
class EventHandlerRegistry {
  private handlers: Map<string, IEventHandler> = new Map();

  register(handler: IEventHandler): void {
    this.handlers.set(handler.eventType, handler);
  }

  getHandler(eventType: string): IEventHandler {
    const handler = this.handlers.get(eventType);
    if (!handler) {
      throw new UnsupportedEventTypeError(eventType);
    }
    return handler;
  }

  getSupportedEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
```

### Concrete Implementation - BirthdayEventHandler

```typescript
class BirthdayEventHandler implements IEventHandler {
  eventType = 'BIRTHDAY';

  constructor(private timezoneService: TimezoneService) {}

  generateEvent(user: User): Event {
    const nextBirthday = this.calculateNextOccurrence(user);
    const targetUTC = this.timezoneService.convertToUTC(nextBirthday, user.timezone);

    return new Event({
      userId: user.id,
      eventType: this.eventType,
      status: EventStatus.PENDING,
      targetTimestampUTC: targetUTC,
      targetTimestampLocal: nextBirthday,
      targetTimezone: user.timezone.toString(),
      deliveryPayload: { message: this.formatMessage(user) }
    });
  }

  formatMessage(user: User): string {
    return `Hey, ${user.firstName} ${user.lastName} it's your birthday`;
  }

  selectDeliveryChannel(event: Event): DeliveryChannel {
    return DeliveryChannel.WEBHOOK; // Phase 1
  }

  calculateNextOccurrence(user: User): DateTime {
    // Birthday calculation logic is implemented directly in BirthdayEventHandler
    // (see Story 1.5 - actual implementation in src/domain/services/event-handlers/BirthdayEventHandler.ts)
    const { month, day } = user.dateOfBirth.getMonthDay();
    // ... handles leap years (Feb 29 → Feb 28 in non-leap years)
    // ... calculates next occurrence at 9:00 AM local time
    // ... uses TimezoneService for UTC conversion only
    return nextBirthdayAt9AM; // Simplified for documentation
  }
}
```

### Usage in Use Cases

```typescript
class GenerateEventUseCase {
  constructor(
    private eventHandlerRegistry: EventHandlerRegistry
  ) {}

  execute(user: User, eventType: string): Event {
    const handler = this.eventHandlerRegistry.getHandler(eventType);
    return handler.generateEvent(user);
  }
}
```

### Extensibility

Adding a new event type (e.g., Anniversary):

```typescript
class AnniversaryEventHandler implements IEventHandler {
  eventType = 'ANNIVERSARY';

  generateEvent(user: User): Event {
    // Anniversary-specific logic
  }

  formatMessage(user: User): string {
    return `Happy anniversary, ${user.firstName}!`;
  }

  calculateNextOccurrence(user: User): DateTime {
    // Calculate next anniversary
  }
}

// Register at startup
registry.register(new AnniversaryEventHandler(timezoneService));
```

**Benefits:**
- No changes to scheduler, executor, or database schema
- Event type stored as string in database
- Closed for modification, open for extension

---

## 2. Factory Pattern - Event Creation

**Purpose:** Encapsulate complex event creation logic with timezone conversion, idempotency keys, and formatted payloads.

### EventFactory

```typescript
class EventFactory {
  constructor(
    private timezoneService: TimezoneService,
    private eventHandlerRegistry: EventHandlerRegistry
  ) {}

  createEvent(user: User, eventType: string): Event {
    const handler = this.eventHandlerRegistry.getHandler(eventType);
    const targetLocal = handler.calculateNextOccurrence(user);
    const targetUTC = this.timezoneService.convertToUTC(targetLocal, user.timezone);

    return new Event({
      userId: user.id,
      eventType: eventType,
      status: EventStatus.PENDING,
      targetTimestampUTC: targetUTC,
      targetTimestampLocal: targetLocal,
      targetTimezone: user.timezone.toString(),
      idempotencyKey: IdempotencyKey.generate(user.id, targetUTC),
      deliveryPayload: handler.formatMessage(user),
      version: 1,
      retryCount: 0
    });
  }
}
```

**Dependencies:**
- TimezoneService (domain service)
- EventHandlerRegistry (strategy registry)
- Domain entities (User, Event)
- Value objects (EventStatus, IdempotencyKey)

**Benefits:**
- Single responsibility for event creation
- Consistent event initialization across all event types
- Easy to test event creation in isolation
- Integrates with Strategy Pattern

---

## 3. Chain of Responsibility - Event Validation

**Purpose:** Composable validation chain where each validator checks one aspect of event validity.

### IEventValidator Interface

```typescript
interface IEventValidator {
  setNext(validator: IEventValidator): IEventValidator;
  validate(event: Event): ValidationResult;
}

class ValidationResult {
  constructor(
    public readonly isValid: boolean,
    public readonly errors: string[]
  ) {}

  static success(): ValidationResult {
    return new ValidationResult(true, []);
  }

  static fail(error: string): ValidationResult {
    return new ValidationResult(false, [error]);
  }
}
```

### Concrete Validators

```typescript
class EventStatusValidator implements IEventValidator {
  private next: IEventValidator | null = null;

  setNext(validator: IEventValidator): IEventValidator {
    this.next = validator;
    return validator;
  }

  validate(event: Event): ValidationResult {
    if (event.status !== EventStatus.PENDING) {
      return ValidationResult.fail(`Invalid status: ${event.status}`);
    }
    return this.next ? this.next.validate(event) : ValidationResult.success();
  }
}

class EventTimingValidator implements IEventValidator {
  private next: IEventValidator | null = null;

  setNext(validator: IEventValidator): IEventValidator {
    this.next = validator;
    return validator;
  }

  validate(event: Event): ValidationResult {
    if (event.targetTimestampUTC > DateTime.now()) {
      return ValidationResult.fail('Event not yet ready');
    }
    return this.next ? this.next.validate(event) : ValidationResult.success();
  }
}

class EventRetryLimitValidator implements IEventValidator {
  private next: IEventValidator | null = null;

  setNext(validator: IEventValidator): IEventValidator {
    this.next = validator;
    return validator;
  }

  validate(event: Event): ValidationResult {
    if (event.retryCount >= 3) {
      return ValidationResult.fail('Max retries exceeded');
    }
    return this.next ? this.next.validate(event) : ValidationResult.success();
  }
}
```

### Usage

```typescript
const validationChain = new EventStatusValidator();
validationChain
  .setNext(new EventTimingValidator())
  .setNext(new EventRetryLimitValidator());

const result = validationChain.validate(event);
if (!result.isValid) {
  throw new ValidationError(result.errors);
}
```

**Benefits:**
- Each validator has single responsibility
- Easy to add new validation rules
- Validators can be reordered or conditionally applied
- Validation logic stays in domain layer

---

## 4. Observer Pattern - Event Lifecycle Hooks

**Purpose:** Decouple event lifecycle from side effects (metrics, logging, audit trails).

### IEventObserver Interface

```typescript
interface IEventObserver {
  onEventCreated(event: Event): void;
  onEventClaimed(event: Event): void;
  onEventCompleted(event: Event): void;
  onEventFailed(event: Event, reason: string): void;
}
```

### Concrete Observers

```typescript
class MetricsObserver implements IEventObserver {
  constructor(private metricsClient: IMetricsClient) {}

  onEventCreated(event: Event): void {
    this.metricsClient.increment('events.created', {
      eventType: event.eventType
    });
  }

  onEventCompleted(event: Event): void {
    this.metricsClient.increment('events.completed', {
      eventType: event.eventType
    });
    this.metricsClient.timing(
      'events.execution_time',
      event.executedAt.diff(event.targetTimestampUTC).as('milliseconds')
    );
  }

  onEventFailed(event: Event, reason: string): void {
    this.metricsClient.increment('events.failed', {
      eventType: event.eventType,
      reason
    });
  }
}

class LoggingObserver implements IEventObserver {
  constructor(private logger: ILogger) {}

  onEventClaimed(event: Event): void {
    this.logger.info('Event claimed', {
      eventId: event.id,
      targetTime: event.targetTimestampUTC
    });
  }

  onEventFailed(event: Event, reason: string): void {
    this.logger.error('Event failed', {
      eventId: event.id,
      reason,
      retryCount: event.retryCount
    });
  }
}

class AuditObserver implements IEventObserver {
  constructor(private auditRepository: IAuditRepository) {}

  onEventCompleted(event: Event): void {
    this.auditRepository.record({
      eventId: event.id,
      action: 'COMPLETED',
      timestamp: DateTime.now()
    });
  }
}
```

### Integration with Event Entity

```typescript
class Event {
  private observers: IEventObserver[] = [];

  attachObserver(observer: IEventObserver): void {
    this.observers.push(observer);
  }

  detachObserver(observer: IEventObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  markCompleted(executedAt: DateTime): void {
    this.status = EventStatus.COMPLETED;
    this.executedAt = executedAt;
    this.observers.forEach(obs => obs.onEventCompleted(this));
  }

  markFailed(reason: string): void {
    this.status = EventStatus.FAILED;
    this.failureReason = reason;
    this.retryCount++;
    this.observers.forEach(obs => obs.onEventFailed(this, reason));
  }
}
```

**Benefits:**
- Decouples event lifecycle from side effects
- Easy to add new observers without modifying Event entity
- Follows Open/Closed Principle
- Observers can be conditionally attached (e.g., no metrics in tests)

---

## 5. Specification Pattern - Composable Queries

**Purpose:** Encapsulate business rules as composable specifications for querying events.

### ISpecification Interface

```typescript
interface ISpecification<T> {
  isSatisfiedBy(item: T): boolean;
  and(other: ISpecification<T>): ISpecification<T>;
  or(other: ISpecification<T>): ISpecification<T>;
  not(): ISpecification<T>;
}

abstract class Specification<T> implements ISpecification<T> {
  abstract isSatisfiedBy(item: T): boolean;

  and(other: ISpecification<T>): ISpecification<T> {
    return new AndSpecification(this, other);
  }

  or(other: ISpecification<T>): ISpecification<T> {
    return new OrSpecification(this, other);
  }

  not(): ISpecification<T> {
    return new NotSpecification(this);
  }
}
```

### Composite Specifications

```typescript
class AndSpecification<T> extends Specification<T> {
  constructor(
    private left: ISpecification<T>,
    private right: ISpecification<T>
  ) {
    super();
  }

  isSatisfiedBy(item: T): boolean {
    return this.left.isSatisfiedBy(item) && this.right.isSatisfiedBy(item);
  }
}

class OrSpecification<T> extends Specification<T> {
  constructor(
    private left: ISpecification<T>,
    private right: ISpecification<T>
  ) {
    super();
  }

  isSatisfiedBy(item: T): boolean {
    return this.left.isSatisfiedBy(item) || this.right.isSatisfiedBy(item);
  }
}

class NotSpecification<T> extends Specification<T> {
  constructor(private spec: ISpecification<T>) {
    super();
  }

  isSatisfiedBy(item: T): boolean {
    return !this.spec.isSatisfiedBy(item);
  }
}
```

### Concrete Event Specifications

```typescript
class ReadyEventSpecification extends Specification<Event> {
  isSatisfiedBy(event: Event): boolean {
    return event.status === EventStatus.PENDING
      && event.targetTimestampUTC <= DateTime.now();
  }
}

class OverdueEventSpecification extends Specification<Event> {
  constructor(private thresholdHours: number = 1) {
    super();
  }

  isSatisfiedBy(event: Event): boolean {
    return event.status === EventStatus.PENDING
      && event.targetTimestampUTC < DateTime.now().minus({ hours: this.thresholdHours });
  }
}

class EventTypeSpecification extends Specification<Event> {
  constructor(private eventType: string) {
    super();
  }

  isSatisfiedBy(event: Event): boolean {
    return event.eventType === this.eventType;
  }
}
```

### Usage

```typescript
// Find ready birthday events
const spec = new ReadyEventSpecification()
  .and(new EventTypeSpecification('BIRTHDAY'));

const events = await eventRepository.findBySpecification(spec);

// Find overdue events (any type)
const overdueSpec = new OverdueEventSpecification(24); // 24 hours late
const overdueEvents = await eventRepository.findBySpecification(overdueSpec);

// Complex query: Ready birthdays OR overdue anniversaries
const complexSpec = new ReadyEventSpecification()
  .and(new EventTypeSpecification('BIRTHDAY'))
  .or(
    new OverdueEventSpecification(1)
      .and(new EventTypeSpecification('ANNIVERSARY'))
  );
```

**Benefits:**
- Business rules as first-class objects
- Composable queries (AND, OR, NOT)
- Reusable specifications across repositories and use cases
- Keeps query logic in domain layer

---

## 6. Builder Pattern - Test Data Creation

**Purpose:** Fluent API for creating test data with sensible defaults and readable test code.

### UserBuilder

```typescript
class UserBuilder {
  private id: string = randomUUID();
  private firstName: string = 'John';
  private lastName: string = 'Doe';
  private dateOfBirth: string = '1990-01-01';
  private timezone: string = 'America/New_York';

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withFirstName(name: string): this {
    this.firstName = name;
    return this;
  }

  withLastName(name: string): this {
    this.lastName = name;
    return this;
  }

  withDateOfBirth(dob: string): this {
    this.dateOfBirth = dob;
    return this;
  }

  withTimezone(tz: string): this {
    this.timezone = tz;
    return this;
  }

  build(): User {
    return new User({
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      dateOfBirth: new DateOfBirth(this.dateOfBirth),
      timezone: new Timezone(this.timezone),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now()
    });
  }
}
```

### EventBuilder

```typescript
class EventBuilder {
  private id: string = randomUUID();
  private userId: string = randomUUID();
  private eventType: string = 'BIRTHDAY';
  private status: EventStatus = EventStatus.PENDING;
  private targetTimestampUTC: DateTime = DateTime.now().plus({ days: 1 });
  private version: number = 1;
  private retryCount: number = 0;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withUserId(userId: string): this {
    this.userId = userId;
    return this;
  }

  withStatus(status: EventStatus): this {
    this.status = status;
    return this;
  }

  withTargetTimestamp(timestamp: DateTime): this {
    this.targetTimestampUTC = timestamp;
    return this;
  }

  thatIsReady(): this {
    this.targetTimestampUTC = DateTime.now().minus({ minutes: 5 });
    this.status = EventStatus.PENDING;
    return this;
  }

  thatIsOverdue(hours: number): this {
    this.targetTimestampUTC = DateTime.now().minus({ hours });
    this.status = EventStatus.PENDING;
    return this;
  }

  withMaxRetries(): this {
    this.retryCount = 3;
    this.status = EventStatus.FAILED;
    return this;
  }

  build(): Event {
    return new Event({
      id: this.id,
      userId: this.userId,
      eventType: this.eventType,
      status: this.status,
      targetTimestampUTC: this.targetTimestampUTC,
      targetTimestampLocal: this.targetTimestampUTC,
      targetTimezone: 'America/New_York',
      idempotencyKey: IdempotencyKey.generate(this.userId, this.targetTimestampUTC),
      deliveryPayload: { message: 'Test message' },
      version: this.version,
      retryCount: this.retryCount,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now()
    });
  }
}
```

### Usage in Tests

```typescript
describe('ExecuteEventUseCase', () => {
  it('should mark event as completed on successful delivery', async () => {
    // Arrange
    const event = new EventBuilder()
      .thatIsReady()
      .build();

    const user = new UserBuilder()
      .withFirstName('Jane')
      .withTimezone('Europe/London')
      .build();

    // Act
    await useCase.execute(event.id);

    // Assert
    expect(event.status).toBe(EventStatus.COMPLETED);
  });

  it('should fail event when max retries exceeded', async () => {
    const event = new EventBuilder()
      .thatIsReady()
      .withMaxRetries()
      .build();

    await expect(useCase.execute(event.id)).rejects.toThrow(MaxRetriesExceededError);
  });
});
```

**Benefits:**
- Sensible defaults reduce test boilerplate
- Fluent API reads like natural language
- Expressive intent methods (`thatIsReady()`, `thatIsOverdue()`)
- Easy to maintain when domain models change

---

## 7. Template Method Pattern - Use Case Execution

**Purpose:** Define common execution flow for use cases while allowing subclasses to customize specific steps.

### Abstract Use Case

```typescript
abstract class AbstractExecutionUseCase<TRequest, TResponse> {
  async execute(request: TRequest): Promise<TResponse> {
    // Template method defining the algorithm
    await this.validate(request);
    const result = await this.executeCore(request);
    await this.afterExecution(result);
    return result;
  }

  // Hook methods (can be overridden)
  protected async validate(request: TRequest): Promise<void> {
    // Default: no validation
  }

  protected async afterExecution(result: TResponse): Promise<void> {
    // Default: no post-processing
  }

  // Abstract method (must be implemented)
  protected abstract executeCore(request: TRequest): Promise<TResponse>;
}
```

### Concrete Use Case

```typescript
class ExecuteEventUseCase extends AbstractExecutionUseCase<string, void> {
  constructor(
    private eventRepository: IEventRepository,
    private deliveryAdapter: IDeliveryAdapter,
    private logger: ILogger
  ) {
    super();
  }

  protected async validate(eventId: string): Promise<void> {
    if (!eventId) {
      throw new ValidationError('Event ID is required');
    }
  }

  protected async executeCore(eventId: string): Promise<void> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) throw new EventNotFoundError(eventId);

    const result = await this.deliveryAdapter.deliver(event);
    event.markCompleted(result.deliveredAt);
    await this.eventRepository.update(event);
  }

  protected async afterExecution(): Promise<void> {
    this.logger.info('Event execution completed');
  }
}
```

**Benefits:**
- Consistent execution flow across all use cases
- Common concerns (validation, logging) handled in one place
- Easy to add cross-cutting concerns (metrics, audit)
- Subclasses customize only what they need

---

## 8. Distributed Scheduler Pattern - Concurrent Job Claiming

**Status: IMPLEMENTED in Story 1.7** ✅

**Implementation Files:**
- `src/adapters/secondary/persistence/PrismaEventRepository.ts` (claimReadyEvents method)
- `src/__tests__/integration/adapters/secondary/persistence/PrismaEventRepository.test.ts` (concurrency tests)

**Purpose:** Enable multiple scheduler instances to safely claim and process events concurrently without duplicates or deadlocks. Critical for horizontal scalability in distributed systems.

### The Problem: Race Conditions in Distributed Schedulers

When multiple scheduler instances run simultaneously (e.g., multiple Kubernetes pods), naive implementations cause duplicate processing:

```typescript
// ❌ BROKEN: Race condition without row locking
async claimReadyEvents(limit: number): Promise<Event[]> {
  // Step 1: Instance A reads events 1, 2, 3
  // Step 2: Instance B reads events 1, 2, 3 (SAME EVENTS!)
  const events = await prisma.event.findMany({
    where: { status: 'PENDING', targetTimestampUTC: { lte: new Date() } },
    take: limit
  });

  // Step 3: Both instances update the SAME events to PROCESSING
  await prisma.event.updateMany({
    where: { id: { in: events.map(e => e.id) } },
    data: { status: 'PROCESSING' }
  });

  // Result: Both instances process events 1, 2, 3
  // User receives DUPLICATE birthday messages! 🎂🎂🎂
  return events;
}
```

**Real-world impact:**
- ❌ Duplicate birthday emails/SMS sent to users
- ❌ Duplicate webhook calls to external systems
- ❌ Wasted processing resources
- ❌ Data inconsistency

### The Solution: PostgreSQL Row-Level Locking

**`FOR UPDATE SKIP LOCKED`** provides atomic job claiming with two PostgreSQL clauses:

1. **`FOR UPDATE`** - Locks selected rows within a transaction
2. **`SKIP LOCKED`** - Skips already-locked rows instead of waiting

```typescript
// ✅ CORRECT: Row-level locking prevents race conditions
async claimReadyEvents(limit: number): Promise<Event[]> {
  return this.prisma.$transaction(async (tx) => {
    const now = new Date();

    // Step 1: SELECT with row-level locking
    const events = await tx.$queryRaw<Array<RawEvent>>`
      SELECT * FROM events
      WHERE status = 'PENDING'
        AND target_timestamp_utc <= ${now}
      ORDER BY target_timestamp_utc ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    if (events.length === 0) {
      return [];
    }

    // Step 2: UPDATE locked rows to PROCESSING
    const eventIds = events.map(e => e.id);
    await tx.event.updateMany({
      where: { id: { in: eventIds } },
      data: {
        status: 'PROCESSING',
        version: { increment: 1 }
      }
    });

    // Locks released on transaction commit
    return events.map(eventToDomain);
  });
}
```

### How `FOR UPDATE SKIP LOCKED` Works

**Visual Analogy: Job Queue at a Factory**

Imagine 10 packages on a conveyor belt being processed by 3 workers:

```
┌─────────────────────────────────────────────────────────────┐
│ Conveyor Belt: 10 PENDING Events                           │
│ [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]                   │
└─────────────────────────────────────────────────────────────┘

Worker A (Scheduler 1): Grabs packages 1-3 → puts 🔒 on them
Worker B (Scheduler 2): Skips 🔒 1-3, grabs packages 4-6
Worker C (Scheduler 3): Skips 🔒 1-6, grabs packages 7-9

✅ Result: All workers busy, no duplicates, no waiting!
Package 10 waits for next round.
```

**Without `SKIP LOCKED` (using only `FOR UPDATE`):**
```
Worker A: Grabs packages 1-5 → puts 🔒 on them
Worker B: Tries to grab packages → sees 🔒 → ⏳ WAITS
Worker C: Tries to grab packages → sees 🔒 → ⏳ WAITS

❌ Result: Workers B and C are idle (potential deadlock)
```

### Execution Flow with 3 Concurrent Instances

```sql
-- Instance 1 (Transaction 1 starts)
BEGIN;
SELECT * FROM events WHERE status='PENDING' LIMIT 5 FOR UPDATE SKIP LOCKED;
-- ✅ Returns events 1-5, locks them

-- Instance 2 (Transaction 2 starts - almost simultaneously)
BEGIN;
SELECT * FROM events WHERE status='PENDING' LIMIT 5 FOR UPDATE SKIP LOCKED;
-- ✅ Skips locked events 1-5, returns events 6-10, locks them

-- Instance 3 (Transaction 3 starts - almost simultaneously)
BEGIN;
SELECT * FROM events WHERE status='PENDING' LIMIT 5 FOR UPDATE SKIP LOCKED;
-- ✅ All events locked, returns empty array []

-- Instance 1 updates and commits
UPDATE events SET status='PROCESSING' WHERE id IN (1,2,3,4,5);
COMMIT; -- Releases locks on events 1-5

-- Instance 2 updates and commits
UPDATE events SET status='PROCESSING' WHERE id IN (6,7,8,9,10);
COMMIT; -- Releases locks on events 6-10

-- Instance 3 does nothing (no events claimed)
COMMIT;

-- Final state: All 10 events PROCESSING, no duplicates ✅
```

### Why Prisma's Native Methods Don't Work

**Prisma does NOT support `FOR UPDATE SKIP LOCKED`** in its query builder (as of 2025):

```typescript
// ❌ Not possible with Prisma's findMany
const events = await prisma.event.findMany({
  where: { status: 'PENDING' },
  forUpdate: true,        // ❌ Does not exist
  skipLocked: true        // ❌ Does not exist
});
```

**Alternative approaches and why they fail:**

1. **Optimistic Concurrency Control (Prisma's recommendation)**
   - ❌ Detects conflicts AFTER they occur (read → fail on version mismatch)
   - ❌ Doesn't prevent duplicate claims, just fails them
   - ❌ Requires retry logic, wastes processing

2. **findMany() + updateMany() without locking**
   - ❌ Race condition between SELECT and UPDATE
   - ❌ Multiple instances read same events before any UPDATE completes

3. **Interactive transactions without FOR UPDATE**
   - ❌ Transactions don't prevent concurrent reads
   - ❌ Still has race condition

**Raw SQL is the ONLY solution** for this use case in Prisma (see GitHub issues #5983, #17136).

### Why the Transaction Wrapper is Critical

```typescript
// ❌ WITHOUT transaction: Locks released immediately
const events = await prisma.$queryRaw`SELECT ... FOR UPDATE SKIP LOCKED`;
// Locks are GONE here!
await prisma.event.updateMany(...); // Race condition possible

// ✅ WITH transaction: Locks held until commit
return prisma.$transaction(async (tx) => {
  const events = await tx.$queryRaw`SELECT ... FOR UPDATE SKIP LOCKED`;
  // Locks still held here ✅
  await tx.event.updateMany(...);
  // Locks still held here ✅
  return events;
  // Locks released on commit ✅
});
```

**Without the transaction wrapper:**
- `FOR UPDATE` locks are released immediately after the `$queryRaw` call
- The `updateMany` runs separately in a new transaction
- Other schedulers can read the same events before the status update completes

**With the transaction wrapper:**
- Both SELECT and UPDATE execute in the same transaction
- Locks are held from SELECT until COMMIT
- Other schedulers see locked rows and skip them correctly

### Scalability Benefits

This pattern enables **horizontal scaling** of the scheduler:

```
┌────────────────────────────────────────────────────────┐
│ Production Deployment (3 Scheduler Pods)               │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Pod 1: Claims events 1-100   ────┐                   │
│  Pod 2: Claims events 101-200 ────┼──→ PostgreSQL     │
│  Pod 3: Claims events 201-300 ────┘    (10K events)   │
│                                                        │
│  ✅ All pods busy                                      │
│  ✅ No duplicate processing                            │
│  ✅ No deadlocks                                       │
│  ✅ Linear scalability (add more pods = more throughput)│
└────────────────────────────────────────────────────────┘
```

**Performance characteristics:**
- ✅ **Lock contention:** Minimal (SKIP LOCKED avoids waiting)
- ✅ **Throughput:** Scales linearly with number of instances
- ✅ **Latency:** Sub-millisecond lock acquisition
- ✅ **Deadlocks:** Impossible (no waiting = no circular dependencies)

### Testing Concurrency

The integration test verifies correct behavior with concurrent claims:

```typescript
it('should prevent duplicate claims when called concurrently', async () => {
  // Arrange: 10 PENDING events
  const eventIds = [...]; // 10 events created

  // Act: 3 concurrent scheduler instances
  const [claimed1, claimed2, claimed3] = await Promise.all([
    repository.claimReadyEvents(5), // Instance 1: request 5
    repository.claimReadyEvents(5), // Instance 2: request 5
    repository.claimReadyEvents(5), // Instance 3: request 5
  ]);

  // Assert: No duplicates
  const allClaimedIds = [
    ...claimed1.map(e => e.id),
    ...claimed2.map(e => e.id),
    ...claimed3.map(e => e.id)
  ];

  const uniqueIds = new Set(allClaimedIds);
  expect(allClaimedIds.length).toBe(uniqueIds.size); // No duplicates ✅
  expect(uniqueIds.size).toBe(10); // All 10 events claimed ✅

  // Verify database state
  const dbEvents = await prisma.event.findMany({
    where: { id: { in: eventIds } }
  });
  expect(dbEvents.every(e => e.status === 'PROCESSING')).toBe(true);
  expect(dbEvents.every(e => e.version === 2)).toBe(true);
});
```

**What this test proves:**
- ✅ Each event claimed exactly once (no duplicates)
- ✅ All events claimed (none missed)
- ✅ Correct status transition (PENDING → PROCESSING)
- ✅ Version incremented atomically

### Use Cases Beyond Birthday Reminders

This pattern applies to any distributed job queue:

1. **Message Queues** - Multiple consumers reading from a queue table
2. **Task Schedulers** - Distributing background jobs across workers
3. **Ticket Booking** - Multiple users booking the same seats concurrently
4. **Inventory Management** - Multiple orders claiming the same products
5. **Email/SMS Campaigns** - Distributing deliveries across sender instances
6. **Data Processing Pipelines** - Multiple workers processing records from a staging table

### Summary

**Key Takeaways:**

1. **`FOR UPDATE`** locks rows to prevent concurrent access
2. **`SKIP LOCKED`** allows parallel processing without waiting or deadlocks
3. **Transaction wrapper** is mandatory to hold locks across SELECT + UPDATE
4. **Raw SQL is required** - Prisma doesn't support row-level locking clauses
5. **Horizontal scalability** - Add more scheduler instances for more throughput
6. **Zero duplicate processing** - Each job claimed by exactly one worker

**When to use this pattern:**
- ✅ Multiple instances processing a shared job queue
- ✅ High-concurrency systems with distributed workers
- ✅ Need for atomic job claiming without duplicates
- ✅ PostgreSQL database (MySQL 8.0+ also supports SKIP LOCKED)

**When NOT to use this pattern:**
- ❌ Single-instance systems (no concurrency = no need)
- ❌ Non-relational databases (MongoDB, DynamoDB - use different patterns)
- ❌ Read-heavy workloads (row locks are for writes)

### Query Performance and Indexing

**The claiming query must be fast** (<50ms) to work well in Lambda and high-concurrency scenarios.

#### The Scheduler Query

```sql
SELECT * FROM events
WHERE status = 'PENDING'
  AND target_timestamp_utc <= NOW()
ORDER BY target_timestamp_utc ASC
LIMIT 100
FOR UPDATE SKIP LOCKED
```

#### Required Index

```prisma
// Current index in schema.prisma (line 53)
@@index([targetTimestampUTC, status], map: "idx_events_scheduler_query")
```

**This index is sufficient for MVP** and will perform well up to millions of events.

#### Index Column Order

**Current:** `(targetTimestampUTC, status)`
**Query uses:** `WHERE status = 'PENDING' AND target_timestamp_utc <= NOW()`

**PostgreSQL Best Practice:**
- Equality filters (`status = 'PENDING'`) should come first
- Range filters (`target_timestamp_utc <= NOW()`) should come second

**Optimal index order (post-MVP optimization):**
```prisma
@@index([status, targetTimestampUTC], map: "idx_events_scheduler_query")
```

**Why change it?**
1. PostgreSQL scans all `PENDING` rows first (equality filter)
2. Then applies range filter on `target_timestamp_utc`
3. More efficient when `status = 'PENDING'` is highly selective

**When to optimize:**
- ⏱️ Query consistently takes >200ms
- 🚨 Lambda timeouts occurring
- 📊 Database CPU >70%
- 🔒 Slow lock acquisition

**Impact at different scales:**
- **1K-10K events:** Negligible difference (<5ms improvement)
- **100K events:** Noticeable (10-30ms improvement)
- **1M+ events:** Significant (50-100ms improvement)

**MVP Decision:** Keep current index order. Optimize only if metrics show issues.

#### Advanced: Partial Index (Future)

For maximum performance in serverless environments:

```sql
-- Partial index (PostgreSQL-specific, requires raw SQL migration)
CREATE INDEX CONCURRENTLY idx_events_ready_to_claim
ON events (target_timestamp_utc ASC)
WHERE status = 'PENDING';
```

**Benefits:**
- Smaller index size (only PENDING events)
- Faster index scan (no COMPLETED/FAILED rows)
- Ideal for Lambda cold start latency
- More cache-friendly

**Drawbacks:**
- Prisma doesn't support partial indexes in schema (requires raw SQL)
- More complex to maintain
- Overkill for most use cases

**When to use:**
- Handling millions of events with high churn
- Lambda cold starts >2 seconds due to index scan
- Database has limited memory for index caching

#### Query Plan Analysis

To verify index usage in production:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM events
WHERE status = 'PENDING'
  AND target_timestamp_utc <= NOW()
ORDER BY target_timestamp_utc ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

**Expected output (good performance):**
```
LockRows  (cost=X..Y rows=100)
  ->  Limit  (cost=X..Y rows=100)
        ->  Index Scan using idx_events_scheduler_query on events
              Index Cond: ((target_timestamp_utc <= now()) AND (status = 'PENDING'))
              Rows Removed by Filter: 0
```

**Red flags:**
- ❌ `Seq Scan` instead of `Index Scan` (index not used!)
- ❌ `Rows Removed by Filter: 10000` (poor index selectivity)
- ❌ `Buffers: shared hit=1000` (too many buffer reads)

#### Monitoring Query Performance

**Lambda implementation:**

```typescript
public async claimReadyEvents(limit: number): Promise<Event[]> {
  const startTime = Date.now();

  const events = await this.prisma.$transaction(async (tx) => {
    const queryStart = Date.now();

    const events = await tx.$queryRaw`
      SELECT * FROM events
      WHERE status = 'PENDING'
        AND target_timestamp_utc <= NOW()
      ORDER BY target_timestamp_utc ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    const queryDuration = Date.now() - queryStart;

    // Log metrics for CloudWatch
    console.log('ClaimQuery', {
      queryDurationMs: queryDuration,
      eventsFound: events.length,
      batchSize: limit,
    });

    if (events.length === 0) return [];

    await tx.event.updateMany({ /* ... */ });

    return events.map(eventToDomain);
  });

  const totalDuration = Date.now() - startTime;

  // Log transaction metrics
  console.log('ClaimTransaction', {
    totalDurationMs: totalDuration,
    eventsClaimed: events.length,
  });

  return events;
}
```

**CloudWatch Metrics to Track:**
- `ClaimQuery.queryDurationMs` - Should be <50ms
- `ClaimTransaction.totalDurationMs` - Should be <200ms
- `ClaimTransaction.eventsClaimed` - Throughput per Lambda

**Alert thresholds:**
- ⚠️ Warning: Query >100ms (p95)
- 🚨 Critical: Query >200ms (p95)
- 🚨 Critical: Transaction >1s (p95)

#### Performance Benchmarks

**Expected performance at different scales:**

| Event Count | Index Type | Query Time | Lock Acquisition |
|-------------|-----------|------------|------------------|
| 1K | Current | 5-10ms | <1ms |
| 10K | Current | 10-20ms | <1ms |
| 100K | Current | 20-50ms | 1-5ms |
| 100K | Optimized | 15-30ms | 1-5ms |
| 1M | Current | 50-100ms | 5-10ms |
| 1M | Optimized | 30-60ms | 5-10ms |
| 1M | Partial Index | 20-40ms | 5-10ms |

**Hardware assumptions:**
- RDS PostgreSQL db.t3.medium
- 2 vCPU, 4 GB RAM
- General Purpose SSD (gp3)

#### Key Takeaways

1. **Current implementation is optimized for MVP**
   - Index exists and will be used
   - Query is simple and fast
   - Transaction is atomic

2. **Don't optimize prematurely**
   - Ship MVP and monitor metrics
   - Optimize only if metrics show issues
   - Real bottleneck is usually network/processing, not query

3. **The transaction wrapper was the critical fix**
   - More important than index order
   - Prevents race conditions
   - Enables distributed concurrency

4. **Serverless-specific considerations**
   - RDS Proxy is mandatory (connection pooling)
   - Transaction timeout must be < Lambda timeout
   - Monitor cold start impact on query performance

**References:**
- Implementation: `src/adapters/secondary/persistence/PrismaEventRepository.ts:125-194`
- Schema: `prisma/schema.prisma:53` (index definition)
- Tests: `src/__tests__/integration/adapters/secondary/persistence/PrismaEventRepository.test.ts:345-415`
- PostgreSQL Docs: [Row Locking](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- PostgreSQL Docs: [Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- Prisma GitHub Issues: [#5983 (FOR UPDATE SKIP LOCKED)](https://github.com/prisma/prisma/issues/5983)

---
