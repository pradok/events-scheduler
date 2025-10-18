# Design Patterns

**Comprehensive design pattern implementations for extensibility and maintainability**

Reference: [Full Architecture Document](../architecture.md)

---

## Overview

The architecture implements 7 design patterns to ensure clean separation of concerns, extensibility, and testability:

1. **Strategy Pattern** - Pluggable event type handlers (Birthday, Anniversary, Reminder)
2. **Factory Pattern** - Event creation with complex business logic
3. **Chain of Responsibility** - Composable event validation
4. **Observer Pattern** - Event lifecycle hooks for metrics and logging
5. **Specification Pattern** - Composable query specifications
6. **Builder Pattern** - Fluent test data creation
7. **Template Method** - Abstract execution flow for use cases

All patterns follow **Domain-Driven Design** principles with zero infrastructure dependencies in domain layer.

---

## 1. Strategy Pattern - Event Type Handlers

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
    return this.timezoneService.calculateNextBirthday(
      user.dateOfBirth,
      user.timezone,
      DateTime.now()
    );
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
