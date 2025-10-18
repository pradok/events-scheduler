# Architecture Design: Time-Based Event Scheduling System

This document outlines the high-level architecture design for the time-based event scheduling system (Phase 1: Birthday Messaging MVP).

---

## Core Technical Challenges

Based on [challenges.md](challenges.md), we identify the five most critical challenges that drive our architecture:

### 1. Distributed Time Zone Scheduling
**Challenge**: Coordinate message delivery across multiple time zones at precisely 9am local time.

**Architectural Impact**:
- Need timezone conversion layer
- Store target times in UTC for consistent querying
- Snapshot timezone at event generation (immutable events)
- Use IANA timezone database

### 2. Race Conditions & Exactly-Once Delivery
**Challenge**: Multiple scheduler instances must not send duplicate messages.

**Architectural Impact**:
- Atomic state transitions using database transactions
- Optimistic locking on event status updates
- Idempotency keys for external API calls
- Event status state machine: PENDING → PROCESSING → COMPLETED/FAILED

### 3. Failure Recovery Without Duplicates
**Challenge**: System must catch up after downtime without sending duplicates.

**Architectural Impact**:
- Event status tracking with timestamps
- Grace period for "late" event execution
- Query-based recovery (find all PENDING events past target time)
- Separate "on-time" vs "late" execution tracking

### 4. Scalability at Peak Load
**Challenge**: Handle burst processing when many events trigger simultaneously.

**Architectural Impact**:
- Batch processing of events (process N events per scheduler run)
- Database indexing on (targetTimestampUTC, status)
- Horizontal scaling capability (stateless components)
- Queue-based architecture for future phases

### 5. Date Boundary Logic & Edge Cases
**Challenge**: Handle leap years, DST transitions, timezone changes.

**Architectural Impact**:
- Encapsulate date logic in dedicated service
- Immutable event instances (snapshot user data at generation)
- Document edge case handling in code
- Comprehensive test coverage for date scenarios

---

## Architectural Patterns

This architecture follows established software design patterns that work together to create a maintainable, testable, and extensible system.

### Layered Architecture

The foundation is a **classic layered architecture** with clear separation of concerns:

```
Infrastructure Layer (External I/O)
        ↑
Repository Layer (Data Access)
        ↑
Domain Layer (Business Logic)
        ↑
Use Case Layer (Application Orchestration)
        ↑
API Layer (HTTP Interface)
```

**Benefits**:
- Each layer depends only on layers below it
- Easy to test (mock lower layers)
- Clear boundaries and responsibilities

### Domain-Driven Design (DDD)

We apply **DDD tactical patterns** to model the business domain:

#### Entities (with identity and lifecycle)
- **User**: Aggregate root managing user data
- **BirthdayEvent**: Aggregate root managing event lifecycle

#### Value Objects (immutable, no identity)
- **ExecutionResult**: Represents the outcome of event execution

#### Domain Services (stateless operations)
- **TimezoneService**: Timezone conversion logic
- **EventGenerationService**: Event creation rules
- **IdempotencyService**: Duplicate prevention logic

#### Repositories (data access abstraction)
- **UserRepository**: User persistence operations
- **EventRepository**: Event persistence operations

#### Aggregate Roots
- **User** and **BirthdayEvent** are aggregate roots
- Each manages its own consistency boundaries
- External objects can only reference them by ID

#### Invariants (business rules enforced by entities)
- User: dateOfBirth must be in past, timezone must be valid
- BirthdayEvent: status transitions must follow state machine rules

**Benefits**:
- Business logic is in the domain, not scattered across layers
- Entities enforce their own invariants
- Ubiquitous language (User, Event, Scheduler, Executor)
- Domain model is technology-agnostic

### Hexagonal Architecture (Ports & Adapters)

The system follows **hexagonal architecture** to isolate the core domain from external concerns:

```
        ┌─────────────────────────────────────┐
        │     Inbound Adapters               │
        │  (Express Controllers, CLI)        │
        └───────────────┬────────────────────┘
                        │
        ┌───────────────▼────────────────────┐
        │         Inbound Ports              │
        │    (Service Interfaces)            │
        └───────────────┬────────────────────┘
                        │
        ┌───────────────▼────────────────────┐
        │                                     │
        │         CORE DOMAIN                │
        │                                     │
        │  Entities, Domain Services,        │
        │  Business Rules, Domain Logic      │
        │                                     │
        └───────────────┬────────────────────┘
                        │
        ┌───────────────▼────────────────────┐
        │        Outbound Ports              │
        │  (Repository, EventHandler         │
        │   interfaces)                      │
        └───────────────┬────────────────────┘
                        │
        ┌───────────────▼────────────────────┐
        │      Outbound Adapters             │
        │  (Database, Webhooks, Email)       │
        └────────────────────────────────────┘
```

#### Core Domain (inside the hexagon)
- Entities: User, BirthdayEvent
- Domain Services: TimezoneService, EventGenerationService
- Business rules and invariants
- **Technology-agnostic**: No knowledge of HTTP, databases, or external APIs

#### Ports (interfaces that define contracts)

**Inbound Ports** (driving the application):
```typescript
interface UserUseCase {
  createUser(userData: UserData): Promise<User>;
  updateUser(userId: UUID, updates: Partial<UserData>): Promise<User>;
  deleteUser(userId: UUID): Promise<void>;
}

interface EventSchedulerUseCase {
  findReadyEvents(currentTime: Date): Promise<BirthdayEvent[]>;
  executeEvents(events: BirthdayEvent[]): Promise<void>;
}
```

**Outbound Ports** (driven by the application):
```typescript
interface UserRepository {
  create(user: User): Promise<User>;
  findById(id: UUID): Promise<User | null>;
  update(user: User): Promise<User>;
  delete(id: UUID): Promise<void>;
}

interface EventHandler {
  handle(event: BirthdayEvent, user: User): Promise<void>;
}

interface MessageSender {
  send(message: string, destination: string): Promise<void>;
}
```

#### Adapters (implementations of ports)

**Inbound Adapters** (technology-specific entry points):

- **Express Controllers**: HTTP → Use Case calls
- **CLI Commands**: Terminal → Use Case calls (future)
- **Scheduler Process**: Cron → EventSchedulerUseCase calls

**Outbound Adapters** (technology-specific implementations):
- **DatabaseUserRepository**: UserRepository → Database (DynamoDB, PostgreSQL, etc.)
- **DatabaseEventRepository**: EventRepository → Database
- **BirthdayMessageHandler**: EventHandler → Webhook POST
- **WebhookClient**: MessageSender → HTTP client

**Benefits**:
- **Testability**: Mock all ports for unit tests
- **Flexibility**: Swap adapters without changing domain (e.g., switch from DynamoDB to PostgreSQL)
- **Independence**: Domain has zero dependencies on frameworks
- **Maintainability**: Changes to external systems don't affect domain

### How They Work Together

```
User Request (HTTP POST /user)
    ↓
[Express Controller] ← Inbound Adapter
    ↓
[UserUseCase] ← Inbound Port
    ↓
[User Entity + Domain Services] ← Core Domain (validates, applies business rules)
    ↓
[UserRepository] ← Outbound Port (interface)
    ↓
[DatabaseUserRepository] ← Outbound Adapter (implementation)
    ↓
[Database] ← Infrastructure
```

### Pattern Summary

| Pattern | Purpose | Benefit |
|---------|---------|---------|
| **Layered Architecture** | Organize code by technical concern | Clear structure, easy to navigate |
| **Domain-Driven Design** | Model business domain richly | Business logic in one place, maintainable |
| **Hexagonal Architecture** | Isolate core from infrastructure | Testable, flexible, framework-independent |
| **Repository Pattern** | Abstract data access | Database-agnostic domain |
| **Strategy Pattern** | Pluggable event handlers | Easy to add new event types |
| **State Machine Pattern** | Control event lifecycle | Prevents invalid state transitions |

**The combination ensures**:
1. ✅ Business logic is isolated and testable
2. ✅ External dependencies can be swapped easily
3. ✅ Code is organized by both technical layers and business concepts
4. ✅ System can evolve without major rewrites

---

## Five-Layer Architecture Details

The system implements five distinct layers that build on the patterns above:

```
┌─────────────────────────────────────────────────┐
│         Layer 1: Event Registry                 │
│   (Event Type Definitions & Configuration)      │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│      Layer 2: Event Materialization             │
│   (Generate Event Instances from Definitions)   │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│         Layer 3: Event Scheduler                │
│      (Time-Based Event Selection)               │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│         Layer 4: Event Executor                 │
│     (Process Events & Call Handlers)            │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│      Layer 5: Recovery & Monitoring             │
│    (Detect & Reprocess Failed Events)           │
└─────────────────────────────────────────────────┘
```

### Layer 1: Event Registry
**Responsibility**: Define event types and their configurations

**Phase 1 Implementation**:
- Single hardcoded event type: "BIRTHDAY"
- Configuration: targetTime = "09:00:00", recurrence = "ANNUAL"

**Future Extensibility**:
```typescript
interface EventTypeDefinition {
  type: string;
  handler: EventHandler;
  recurrenceRule: RecurrenceRule;
  defaultTargetTime: string;
}

// Registry pattern for pluggable event types
class EventRegistry {
  register(definition: EventTypeDefinition): void;
  get(type: string): EventTypeDefinition;
}
```

### Layer 2: Event Materialization
**Responsibility**: Convert abstract event definitions into concrete event instances

**Phase 1 Implementation**:
- When user created → Generate birthday event for current year
- When birthday event completes → Generate next year's event
- When user updated → Cancel old events, generate new ones

**Key Operations**:
```typescript
interface EventGenerator {
  generateBirthdayEvent(user: User): BirthdayEvent;
  calculateTargetTimestamp(date: Date, time: string, timezone: string): Date;
  regenerateEvents(userId: string): void;
}
```

**Future Extensibility**:
- Generic event generation from templates
- Pre-generate multiple years of events
- Support complex recurrence rules

### Layer 3: Event Scheduler
**Responsibility**: Identify events ready for execution based on current time

**Phase 1 Implementation**:
- Periodic job runs every 1 minute
- Query: `SELECT * FROM events WHERE targetTimestampUTC <= NOW() AND status = 'PENDING'`
- Atomic update: Set status to PROCESSING with optimistic locking
- Pass events to Layer 4 for execution

**Key Operations**:
```typescript
interface EventScheduler {
  findReadyEvents(currentTime: Date): Promise<BirthdayEvent[]>;
  markAsProcessing(eventId: string, version: number): Promise<boolean>;
  start(): void; // Start periodic scheduler
  stop(): void;  // Graceful shutdown
}
```

**Scalability Considerations**:
- Process in batches (e.g., 100 events per run)
- Use database indexes on (targetTimestampUTC, status)
- Support horizontal scaling (multiple scheduler instances safe due to optimistic locking)

### Layer 4: Event Executor
**Responsibility**: Execute event actions and manage their lifecycle

**Phase 1 Implementation**:
- Receive event from scheduler
- Load user data (for message template)
- Call appropriate event handler (BirthdayMessageHandler)
- Handle retries (3 attempts with exponential backoff)
- Update event status: COMPLETED or FAILED
- Log execution results

**Key Operations**:
```typescript
interface EventExecutor {
  execute(event: BirthdayEvent): Promise<ExecutionResult>;
  retry(event: BirthdayEvent, attempt: number): Promise<ExecutionResult>;
}

interface EventHandler {
  handle(event: BirthdayEvent, user: User): Promise<void>;
}

class BirthdayMessageHandler implements EventHandler {
  async handle(event: BirthdayEvent, user: User): Promise<void> {
    const message = `Hey, ${user.firstName} ${user.lastName} it's your birthday`;
    await this.webhookClient.post(this.webhookUrl, { message });
  }
}
```

**Error Handling**:
- Retry transient errors (network timeouts, 5xx responses)
- Fail permanently on client errors (4xx responses, validation failures)
- Log all errors with context
- Store last error message in event record

### Layer 5: Recovery & Monitoring
**Responsibility**: Ensure no events are missed and provide observability

**Phase 1 Implementation**:
- On system startup: Query for events where `targetTimestampUTC < NOW() - GRACE_PERIOD` and `status = PENDING`
- Recovery mode: Process all missed events
- Logging: Structured JSON logs for all event state changes
- Metrics: Count of events processed, failed, recovered

**Key Operations**:
```typescript
interface RecoveryManager {
  recoverMissedEvents(): Promise<void>;
  findMissedEvents(gracePeriodMinutes: number): Promise<BirthdayEvent[]>;
}

interface EventMonitor {
  logEventStateChange(event: BirthdayEvent, oldStatus: string, newStatus: string): void;
  recordMetric(metric: string, value: number): void;
}
```

**Future Extensibility**:
- Dead letter queue for permanently failed events
- Manual replay functionality
- Alerting on high failure rates
- Dashboard for event status visibility

---

## Domain Model

The domain model defines the core entities and their relationships.

### Core Entities

#### User (Aggregate Root)
```typescript
class User {
  id: UUID;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;      // YYYY-MM-DD format
  timezone: string;        // IANA timezone (e.g., "America/New_York")
  createdAt: Date;
  updatedAt: Date;

  // Domain methods
  getFullName(): string;
  getAge(onDate: Date): number;
  isBirthdayOn(date: Date): boolean;
}
```

**Invariants**:
- firstName and lastName cannot be empty
- dateOfBirth must be in the past
- timezone must be valid IANA timezone
- User cannot be deleted if they have pending events (or cascade delete)

#### BirthdayEvent (Aggregate Root)
```typescript
class BirthdayEvent {
  id: UUID;
  userId: UUID;              // Foreign key to User
  eventType: EventType;      // Enum: "BIRTHDAY" (extensible)
  targetYear: number;        // Year this event targets
  targetDate: Date;          // YYYY-MM-DD (birthday date)
  targetTime: string;        // HH:mm:ss (e.g., "09:00:00")
  timezone: string;          // Snapshot from user at creation
  targetTimestampUTC: Date;  // Calculated UTC timestamp
  status: EventStatus;       // Enum: PENDING, PROCESSING, COMPLETED, FAILED
  executedAt: Date | null;   // When event was executed
  attempts: number;          // Retry counter
  lastError: string | null;  // Last error message
  version: number;           // For optimistic locking
  createdAt: Date;
  updatedAt: Date;

  // Domain methods
  canExecute(currentTime: Date): boolean;
  markAsProcessing(): void;
  markAsCompleted(executedAt: Date): void;
  markAsFailed(error: string): void;
  shouldRetry(): boolean;
  isLateExecution(currentTime: Date): boolean;
}
```

**Invariants**:
- targetTimestampUTC must be calculated correctly from targetDate, targetTime, and timezone
- status transitions must follow state machine rules
- attempts must increment on each retry
- version must increment on each update (optimistic locking)

#### ExecutionResult (Value Object)
```typescript
class ExecutionResult {
  success: boolean;
  executedAt: Date;
  error?: string;
  httpStatusCode?: number;
  retryable: boolean;
}
```

### Enumerations

```typescript
enum EventType {
  BIRTHDAY = "BIRTHDAY"
  // Future: ANNIVERSARY, REMINDER, etc.
}

enum EventStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED"
}
```

### Relationships

```
User (1) ───── (N) BirthdayEvent
  │
  └─ One user can have many birthday events (one per year)
```

### Domain Services

Services that don't naturally belong to a single entity:

#### TimezoneService
```typescript
interface TimezoneService {
  convertToUTC(localDate: Date, localTime: string, timezone: string): Date;
  isValidTimezone(timezone: string): boolean;
  getCurrentTimeInTimezone(timezone: string): Date;
}
```

#### EventGenerationService
```typescript
interface EventGenerationService {
  generateAnnualEvent(user: User, year: number): BirthdayEvent;
  calculateNextOccurrence(event: BirthdayEvent): BirthdayEvent;
}
```

#### IdempotencyService
```typescript
interface IdempotencyService {
  generateKey(event: BirthdayEvent): string;
  hasBeenProcessed(key: string): Promise<boolean>;
  markAsProcessed(key: string): Promise<void>;
}
```

---

## Key Design Patterns

### 1. Strategy Pattern (Event Handlers)
**Purpose**: Allow different event types to have different execution logic

**Implementation**:
```typescript
interface EventHandler {
  handle(event: BirthdayEvent, context: ExecutionContext): Promise<ExecutionResult>;
}

class BirthdayMessageHandler implements EventHandler {
  async handle(event: BirthdayEvent, context: ExecutionContext): Promise<ExecutionResult> {
    // Birthday-specific logic
  }
}

// Future
class AnniversaryMessageHandler implements EventHandler {
  async handle(event: AnniversaryEvent, context: ExecutionContext): Promise<ExecutionResult> {
    // Anniversary-specific logic
  }
}
```

**Benefits**:
- Easy to add new event types
- Each handler is independently testable
- Separation of concerns

### 2. Repository Pattern (Data Access)
**Purpose**: Abstract database operations and enable testability

**Implementation**:
```typescript
interface UserRepository {
  create(user: User): Promise<User>;
  findById(id: UUID): Promise<User | null>;
  update(user: User): Promise<User>;
  delete(id: UUID): Promise<void>;
}

interface EventRepository {
  create(event: BirthdayEvent): Promise<BirthdayEvent>;
  findReadyEvents(currentTime: Date, limit: number): Promise<BirthdayEvent[]>;
  updateStatus(eventId: UUID, status: EventStatus, version: number): Promise<boolean>;
  findByUserId(userId: UUID): Promise<BirthdayEvent[]>;
}
```

**Benefits**:
- Database technology can change without affecting business logic
- Easy to mock for unit tests
- Centralized query logic

### 3. State Machine Pattern (Event Status)
**Purpose**: Enforce valid status transitions for events

**Implementation**:
```typescript
class EventStateMachine {
  private transitions: Map<EventStatus, EventStatus[]> = new Map([
    [EventStatus.PENDING, [EventStatus.PROCESSING]],
    [EventStatus.PROCESSING, [EventStatus.COMPLETED, EventStatus.FAILED, EventStatus.PENDING]],
    [EventStatus.FAILED, [EventStatus.PENDING]], // For retries
    [EventStatus.COMPLETED, []] // Terminal state
  ]);

  canTransition(from: EventStatus, to: EventStatus): boolean {
    return this.transitions.get(from)?.includes(to) ?? false;
  }

  transition(event: BirthdayEvent, to: EventStatus): void {
    if (!this.canTransition(event.status, to)) {
      throw new InvalidStateTransitionError(event.status, to);
    }
    event.status = to;
    event.version++;
  }
}
```

**Benefits**:
- Prevents invalid state transitions
- Self-documenting state flow
- Easy to extend with new states

### 4. Factory Pattern (Event Creation)
**Purpose**: Encapsulate complex event creation logic

**Implementation**:
```typescript
class BirthdayEventFactory {
  constructor(
    private timezoneService: TimezoneService
  ) {}

  createForUser(user: User, year: number): BirthdayEvent {
    const targetDate = new Date(year, user.dateOfBirth.getMonth(), user.dateOfBirth.getDate());
    const targetTimestampUTC = this.timezoneService.convertToUTC(
      targetDate,
      "09:00:00",
      user.timezone
    );

    return new BirthdayEvent({
      id: UUID.generate(),
      userId: user.id,
      eventType: EventType.BIRTHDAY,
      targetYear: year,
      targetDate: targetDate,
      targetTime: "09:00:00",
      timezone: user.timezone,
      targetTimestampUTC: targetTimestampUTC,
      status: EventStatus.PENDING,
      attempts: 0,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}
```

**Benefits**:
- Centralized event creation logic
- Ensures all required fields are set correctly
- Easy to test timezone calculations

### 5. Observer Pattern (Event Lifecycle Hooks)
**Purpose**: Notify interested parties of event lifecycle changes

**Implementation**:
```typescript
interface EventObserver {
  onEventCreated(event: BirthdayEvent): void;
  onEventExecuted(event: BirthdayEvent, result: ExecutionResult): void;
  onEventFailed(event: BirthdayEvent, error: Error): void;
}

class EventLogger implements EventObserver {
  onEventCreated(event: BirthdayEvent): void {
    logger.info("Event created", { eventId: event.id, targetTime: event.targetTimestampUTC });
  }

  onEventExecuted(event: BirthdayEvent, result: ExecutionResult): void {
    logger.info("Event executed", { eventId: event.id, success: result.success });
  }

  onEventFailed(event: BirthdayEvent, error: Error): void {
    logger.error("Event failed", { eventId: event.id, error: error.message });
  }
}

class EventExecutor {
  private observers: EventObserver[] = [];

  addObserver(observer: EventObserver): void {
    this.observers.push(observer);
  }

  private notifyExecuted(event: BirthdayEvent, result: ExecutionResult): void {
    this.observers.forEach(o => o.onEventExecuted(event, result));
  }
}
```

**Benefits**:
- Decoupled logging/monitoring from business logic
- Easy to add new observers (metrics, alerting, audit trail)
- Testable without side effects

### 6. Dependency Injection Pattern
**Purpose**: Enable testability and loose coupling

**Implementation**:
```typescript
class EventExecutor {
  constructor(
    private eventRepository: EventRepository,
    private userRepository: UserRepository,
    private eventHandler: EventHandler,
    private logger: Logger
  ) {}
}

// In main.ts
const eventExecutor = new EventExecutor(
  new DatabaseEventRepository(),
  new DatabaseUserRepository(),
  new BirthdayMessageHandler(webhookClient),
  new WinstonLogger()
);
```

**Benefits**:
- Easy to mock dependencies in tests
- Runtime flexibility (swap implementations)
- Clear dependency graph

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       API Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   User      │  │   Event     │  │   Health    │         │
│  │ Controller  │  │ Controller  │  │ Controller  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│                  Use Case Layer                              │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐     │
│  │    User      │  │  Event Sched.  │  │  Recovery   │     │
│  │   Use Case   │  │   Use Case     │  │  Use Case   │     │
│  └──────────────┘  └────────────────┘  └─────────────┘     │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│                   Domain Layer                               │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐     │
│  │     User     │  │ BirthdayEvent  │  │   Domain    │     │
│  │   (Entity)   │  │   (Entity)     │  │  Services   │     │
│  └──────────────┘  └────────────────┘  └─────────────┘     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Event Handlers, Timezone Service, Event Factory    │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│                 Repository Layer                             │
│  ┌──────────────┐  ┌────────────────┐                       │
│  │     User     │  │     Event      │                       │
│  │  Repository  │  │   Repository   │                       │
│  └──────────────┘  └────────────────┘                       │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│                Infrastructure Layer                          │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐     │
│  │   Database   │  │    Webhook     │  │   Logger    │     │
│  │    (TBD)     │  │     Client     │  │  (Winston)  │     │
│  └──────────────┘  └────────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               Background Scheduler (Separate Process)        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Event Scheduler (Periodic Job - Every 1 minute)    │   │
│  │    ↓                                                  │   │
│  │  Event Executor → Event Handler → Webhook Client    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### Flow 1: Create User
```
1. POST /user → UserController
2. UserController → UserUseCase.createUser(userData)
3. UserUseCase validates and creates User entity (domain)
4. UserUseCase → UserRepository.create(user)
5. UserRepository saves to database
6. UserUseCase → EventGenerationService.generateBirthdayEvent(user) (domain service)
7. EventGenerationService creates BirthdayEvent entity
8. UserUseCase → EventRepository.create(event)
9. Return user to controller → Return 201 Created
```

### Flow 2: Execute Birthday Event (Scheduler)
```
1. Scheduler wakes up (every 1 minute)
2. Scheduler → EventRepository.findReadyEvents(NOW(), limit=100)
3. For each event:
   a. Scheduler → EventRepository.updateStatus(event.id, PROCESSING, event.version)
   b. If update successful (optimistic lock):
      - Scheduler → EventExecutor.execute(event)
      - EventExecutor → UserRepository.findById(event.userId)
      - EventExecutor → BirthdayMessageHandler.handle(event, user)
      - BirthdayMessageHandler → WebhookClient.post(message)
      - EventExecutor → EventRepository.updateStatus(event.id, COMPLETED)
      - EventExecutor → EventGenerationService.generateNextYearEvent(user)
   c. If update fails (version mismatch):
      - Skip event (another instance is processing it)
4. Log metrics and continue
```

### Flow 3: Update User (PUT /user/:id)
```
1. PUT /user/:id → UserController
2. UserController → UserUseCase.updateUser(userId, updates)
3. UserUseCase → UserRepository.findById(userId)
4. UserUseCase updates User entity (domain)
5. If dateOfBirth or timezone changed:
   a. UserUseCase → EventRepository.findByUserId(userId)
   b. UserUseCase → EventRepository.delete(pending events)
   c. UserUseCase → EventGenerationService.regenerateEvents(user) (domain service)
6. UserUseCase → UserRepository.update(user)
7. Return updated user → Return 200 OK
```

### Flow 4: System Recovery
```
1. System starts up
2. RecoveryManager.recoverMissedEvents()
3. RecoveryManager → EventRepository.findMissedEvents(gracePeriod=60min)
4. For each missed event:
   a. RecoveryManager → EventExecutor.execute(event)
   b. Log as "late execution"
5. RecoveryManager transitions to normal operation
```

---

## Separation of Concerns

### API Layer

- HTTP request/response handling
- Request validation (schema, types)
- Error response formatting
- Authentication (future)

### Use Case Layer (Application Layer)

- Application logic orchestration
- Transaction boundaries
- Coordination between domain objects
- Cross-entity workflows
- **Note**: This layer contains NO business logic—it delegates to domain entities and services

### Domain Layer

- Entity behavior and business rules
- Domain invariants
- State transitions
- Value objects
- Domain services (stateless business logic)

### Repository Layer
- Data persistence
- Query construction
- Transaction management
- Database-specific optimizations

### Infrastructure Layer
- External API clients
- Logging
- Configuration
- Database connections

---

## Testing Strategy

### Unit Tests
- Domain entities (User, BirthdayEvent)
- Domain services (TimezoneService, EventGenerationService)
- Event handlers (BirthdayMessageHandler)
- State machine logic
- Date/timezone calculations

**Mock**: Repositories, external services, clock

### Integration Tests
- API endpoints with real database (LocalStack)
- Repository implementations
- Scheduler with database

**Mock**: External webhooks (use test server)

### End-to-End Tests
- Complete flows (create user → event generated → event executed)
- Recovery scenarios (simulate downtime)
- Multi-timezone scenarios
- Race condition scenarios (concurrent requests)

**Mock**: Time (use clock mocking library)

---

## Summary

This architecture:
1. ✅ Addresses all five core technical challenges
2. ✅ Follows layered architecture for separation of concerns
3. ✅ Implements key design patterns for extensibility
4. ✅ Defines clear domain model with invariants
5. ✅ Enables testability at all layers
6. ✅ Supports Phase 1 MVP while allowing future expansion
7. ✅ Uses proven patterns (Repository, Strategy, State Machine, etc.)

The design is **simple enough for MVP** but **architected for growth**.
