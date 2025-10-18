# Test Strategy and Standards

Comprehensive testing approach for the Time-Based Event Scheduling System, including testing philosophy, test types, test data management, and continuous testing practices.

Reference: [Full Architecture Document](../architecture.md)

---

## Testing Philosophy

### Approach
- **Test-Driven Development (TDD)**: Encouraged but not mandatory
- **Test-After**: Acceptable for Phase 1
- **Pragmatic Testing**: Focus on critical paths and business logic

### Coverage Goals
- **Overall Coverage**: ≥80%
- **Critical Paths**: 100% coverage required
  - Scheduler (event claiming logic)
  - Executor (webhook delivery)
  - TimezoneService (date/time calculations)
  - Domain entities (business rules)

### Test Pyramid
Distribute tests according to the testing pyramid:
- **70% Unit Tests**: Fast, isolated, test business logic
- **20% Integration Tests**: Test component interactions with real dependencies
- **10% E2E Tests**: Test complete user journeys

This distribution ensures fast feedback while maintaining confidence in system behavior.

---

## Test Types and Organization

### Unit Tests

#### Framework
**Jest 29.7.0** - Fast, feature-rich testing framework

#### File Convention
`{SourceFileName}.test.ts` (e.g., `User.test.ts`, `CreateUserUseCase.test.ts`)

#### Location
`tests/unit/` directory mirroring `src/` structure:
```
tests/unit/
├── domain/
│   ├── entities/
│   │   ├── User.test.ts
│   │   └── Event.test.ts
│   └── value-objects/
│       ├── Timezone.test.ts
│       └── DateOfBirth.test.ts
└── application/
    └── use-cases/
        ├── CreateUserUseCase.test.ts
        └── ClaimReadyEventsUseCase.test.ts
```

#### Mocking Library
Jest built-in mocks (no additional library needed)

#### Coverage Requirement
≥80% for domain and application layers

#### AI Agent Requirements

When generating unit tests:
1. Generate tests for all public methods and use case `execute()` functions
2. Cover edge cases: invalid inputs, boundary conditions, state transitions
3. Follow AAA pattern (Arrange, Act, Assert)
4. Mock all external dependencies (repositories, message senders, delivery adapters)
5. Use descriptive test names that explain behavior
6. Group related tests with `describe` blocks

#### Example Unit Test

```typescript
describe('User', () => {
  describe('calculateNextBirthday', () => {
    it('should calculate next birthday in same year when birthday has not passed', () => {
      // Arrange
      const user = new User({
        id: UUID.generate(),
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-03-15'),
        timezone: new Timezone('America/New_York')
      });
      const referenceDate = DateTime.fromISO('2025-01-01');

      // Act
      const nextBirthday = user.calculateNextBirthday(referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2025-03-15');
    });

    it('should calculate next birthday in next year when birthday has passed', () => {
      // Arrange
      const user = new User({
        id: UUID.generate(),
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1990-03-15'),
        timezone: new Timezone('America/New_York')
      });
      const referenceDate = DateTime.fromISO('2025-06-01');

      // Act
      const nextBirthday = user.calculateNextBirthday(referenceDate);

      // Assert
      expect(nextBirthday.toISODate()).toBe('2026-03-15');
    });

    it('should handle leap year birthdays', () => {
      // Arrange
      const user = new User({
        id: UUID.generate(),
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: new DateOfBirth('1992-02-29'),
        timezone: new Timezone('America/New_York')
      });
      const referenceDate = DateTime.fromISO('2025-01-01');

      // Act
      const nextBirthday = user.calculateNextBirthday(referenceDate);

      // Assert
      // Non-leap year: celebrate on Feb 28
      expect(nextBirthday.toISODate()).toBe('2025-02-28');
    });
  });
});
```

#### Use Case Test Example

```typescript
describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let userRepository: jest.Mocked<UserRepository>;
  let generateEventUseCase: jest.Mocked<GenerateBirthdayEventUseCase>;

  beforeEach(() => {
    userRepository = {
      create: jest.fn(),
      findById: jest.fn()
    } as any;

    generateEventUseCase = {
      execute: jest.fn()
    } as any;

    useCase = new CreateUserUseCase(userRepository, generateEventUseCase);
  });

  it('should create user and generate birthday event', async () => {
    // Arrange
    const dto: CreateUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      timezone: 'America/New_York'
    };

    const expectedUser = new User({
      id: UUID.generate(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: new DateOfBirth(dto.dateOfBirth),
      timezone: new Timezone(dto.timezone)
    });

    userRepository.create.mockResolvedValue(expectedUser);
    generateEventUseCase.execute.mockResolvedValue(createMockEvent());

    // Act
    const result = await useCase.execute(dto);

    // Assert
    expect(userRepository.create).toHaveBeenCalledTimes(1);
    expect(generateEventUseCase.execute).toHaveBeenCalledWith(expectedUser);
    expect(result.firstName).toBe(dto.firstName);
  });

  it('should throw InvalidTimezoneError for invalid timezone', async () => {
    // Arrange
    const dto: CreateUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      timezone: 'Invalid/Timezone'
    };

    // Act & Assert
    await expect(useCase.execute(dto)).rejects.toThrow(InvalidTimezoneError);
    expect(userRepository.create).not.toHaveBeenCalled();
  });
});
```

---

## Integration Tests

### Scope
Test adapters with real infrastructure:
- Repository implementations with real PostgreSQL
- Message queue adapters with in-memory SQS
- External API clients with stubbed HTTP responses

### Location
`tests/integration/` directory

### Test Infrastructure

#### Database
**Testcontainers PostgreSQL 16** - Real database, not in-memory

Benefits:
- Exact same database as production
- Tests real SQL queries and transactions
- Validates indexes and constraints

#### Message Queue
In-memory SQS mock or LocalStack

#### External APIs
WireMock or nock for HTTP stubbing

### Example Integration Test

```typescript
import { PostgreSqlContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '@/adapters/repositories/PrismaUserRepository';

describe('PrismaUserRepository', () => {
  let container: PostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16').start();

    // Create Prisma client
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: container.getConnectionString()
        }
      }
    });

    // Run migrations
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    // ... run schema

    repository = new PrismaUserRepository(prisma);
  }, 60000); // Timeout for container startup

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  afterEach(async () => {
    // Clean up data between tests
    await prisma.events.deleteMany();
    await prisma.users.deleteMany();
  });

  it('should create and retrieve user', async () => {
    // Arrange
    const user = new User({
      id: UUID.generate(),
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new DateOfBirth('1990-01-15'),
      timezone: new Timezone('America/New_York')
    });

    // Act
    await repository.create(user);
    const retrieved = await repository.findById(user.id);

    // Assert
    expect(retrieved).toBeDefined();
    expect(retrieved?.firstName).toBe(user.firstName);
    expect(retrieved?.dateOfBirth.value).toBe('1990-01-15');
  });

  it('should return null for non-existent user', async () => {
    // Act
    const result = await repository.findById(UUID.generate());

    // Assert
    expect(result).toBeNull();
  });
});
```

---

## End-to-End Tests

### Framework
Jest 29.7.0 (same as unit/integration tests)

### Scope
Full user journeys from API request to database changes and external webhook calls

### Environment
Docker Compose with:
- PostgreSQL 16
- LocalStack (AWS service mocks)
- API server
- Scheduler Lambda
- Worker Lambda

### Test Data
Factory functions in `tests/helpers/fixtures.ts`

### Example E2E Test Scenarios

#### Scenario 1: User Lifecycle

```typescript
describe('User Lifecycle E2E', () => {
  it('should create user, generate event, update timezone, and reschedule event', async () => {
    // 1. Create user
    const createResponse = await request(app)
      .post('/users')
      .send({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-03-15',
        timezone: 'America/New_York'
      })
      .expect(201);

    const userId = createResponse.body.id;
    expect(createResponse.body.nextBirthdayEvent).toBeDefined();

    // 2. Verify event was created
    const eventsResponse = await request(app)
      .get(`/users/${userId}/events`)
      .expect(200);

    expect(eventsResponse.body).toHaveLength(1);
    expect(eventsResponse.body[0].status).toBe('PENDING');

    // 3. Update timezone
    const updateResponse = await request(app)
      .put(`/users/${userId}`)
      .send({
        timezone: 'America/Los_Angeles'
      })
      .expect(200);

    expect(updateResponse.body.rescheduledEvents).toBe(1);

    // 4. Verify event was rescheduled
    const updatedEventsResponse = await request(app)
      .get(`/users/${userId}/events`)
      .expect(200);

    expect(updatedEventsResponse.body[0].targetTimezone).toBe('America/Los_Angeles');
    expect(updatedEventsResponse.body[0].targetTimestampUTC).not.toBe(
      eventsResponse.body[0].targetTimestampUTC
    );
  });
});
```

#### Scenario 2: Event Scheduling

```typescript
describe('Event Scheduling E2E', () => {
  it('should claim event, send to queue, execute, and mark complete', async () => {
    // 1. Create user with birthday tomorrow
    const user = await createTestUser({
      dateOfBirth: '1990-01-15',
      timezone: 'UTC'
    });

    // 2. Time-travel to trigger event
    await advanceTime(Duration.fromObject({ days: 1 }));

    // 3. Trigger scheduler
    await triggerScheduler();

    // 4. Verify event status changed to PROCESSING
    const event = await getEventByUserId(user.id);
    expect(event.status).toBe('PROCESSING');

    // 5. Trigger worker (process SQS message)
    await triggerWorker();

    // 6. Verify webhook was called
    expect(webhookMock.calls).toHaveLength(1);
    expect(webhookMock.calls[0].body).toMatchObject({
      eventId: event.id,
      message: expect.stringContaining('Happy Birthday')
    });

    // 7. Verify event status changed to COMPLETED
    const completedEvent = await getEventByUserId(user.id);
    expect(completedEvent.status).toBe('COMPLETED');
    expect(completedEvent.executedAt).toBeDefined();
  });
});
```

#### Scenario 3: Failure Recovery

```typescript
describe('Failure Recovery E2E', () => {
  it('should recover missed events after system downtime', async () => {
    // 1. Create user with birthday tomorrow
    const user = await createTestUser({
      dateOfBirth: '1990-01-15',
      timezone: 'UTC'
    });

    // 2. Time-travel 24 hours (simulate downtime)
    await advanceTime(Duration.fromObject({ days: 1 }));

    // 3. Event should still be PENDING (missed)
    const event = await getEventByUserId(user.id);
    expect(event.status).toBe('PENDING');
    expect(event.targetTimestampUTC).toBeLessThan(new Date());

    // 4. Trigger recovery service
    await triggerRecovery();

    // 5. Verify event was queued
    const queuedMessages = await getSQSMessages();
    expect(queuedMessages).toHaveLength(1);
    expect(queuedMessages[0].metadata.lateExecution).toBe(true);

    // 6. Process event
    await triggerWorker();

    // 7. Verify event completed
    const completedEvent = await getEventByUserId(user.id);
    expect(completedEvent.status).toBe('COMPLETED');
  });
});
```

---

## Test Data Management

### Strategy
Builder pattern for creating test entities with sensible defaults, database reset between tests

### Builders Location
`tests/helpers/builders/` with `UserBuilder`, `EventBuilder` classes

### Cleanup Strategy
- `afterEach` hooks to truncate tables
- Or use transactions with rollback

### Builder Pattern Implementation

#### UserBuilder

```typescript
class UserBuilder {
  private id: UUID = UUID.generate();
  private firstName = 'John';
  private lastName = 'Doe';
  private dateOfBirth = '1990-01-01';
  private timezone = 'America/New_York';

  withId(id: UUID): this {
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
      timezone: new Timezone(this.timezone)
    });
  }
}
```

#### EventBuilder

```typescript
class EventBuilder {
  private id: UUID = UUID.generate();
  private userId: UUID;
  private eventType = 'BIRTHDAY';
  private status = EventStatus.PENDING;
  private targetTimestampUTC = DateTime.now().plus({ days: 1 });
  private retryCount = 0;

  forUser(userId: UUID): this {
    this.userId = userId;
    return this;
  }

  withEventType(type: string): this {
    this.eventType = type;
    return this;
  }

  withStatus(status: EventStatus): this {
    this.status = status;
    return this;
  }

  thatIsOverdue(): this {
    this.targetTimestampUTC = DateTime.now().minus({ hours: 2 });
    return this;
  }

  thatHasFailedRetries(): this {
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
      retryCount: this.retryCount,
      version: 1,
      idempotencyKey: IdempotencyKey.generate(this.userId, this.targetTimestampUTC),
      deliveryPayload: {
        message: 'Happy Birthday!',
        userName: 'Test User'
      }
    });
  }
}
```

### Usage in Tests

```typescript
describe('ClaimReadyEventsUseCase', () => {
  let useCase: ClaimReadyEventsUseCase;
  let eventRepository: EventRepository;

  beforeEach(() => {
    // Setup repository and use case
  });

  it('should claim only ready events', async () => {
    // Arrange
    const user = new UserBuilder()
      .withTimezone('Europe/London')
      .build();

    const readyEvent = new EventBuilder()
      .forUser(user.id)
      .thatIsOverdue()
      .build();

    const futureEvent = new EventBuilder()
      .forUser(user.id)
      .build();

    await eventRepository.save([readyEvent, futureEvent]);

    // Act
    const claimed = await useCase.execute();

    // Assert
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(readyEvent.id);
  });

  it('should skip events that have failed max retries', async () => {
    // Arrange
    const user = new UserBuilder().build();

    const failedEvent = new EventBuilder()
      .forUser(user.id)
      .thatIsOverdue()
      .thatHasFailedRetries()
      .build();

    await eventRepository.save([failedEvent]);

    // Act
    const claimed = await useCase.execute();

    // Assert
    expect(claimed).toHaveLength(0);
  });
});
```

### Benefits of Builder Pattern

1. **Fluent, readable test setup**: Chain methods for clear intent
2. **Sensible defaults**: Reduce boilerplate in tests
3. **Expressive methods**: `thatIsOverdue()`, `thatHasFailedRetries()` document test intent
4. **Easy variations**: Create test data variations without duplicating setup code
5. **Type safety**: TypeScript ensures correct usage

---

## Continuous Testing

### CI Integration

#### Unit Tests
- **Trigger**: Every push to any branch
- **Timeout**: 5 minutes
- **Failure Action**: Block PR merge

#### Integration Tests
- **Trigger**: PR creation/update
- **Timeout**: 10 minutes
- **Failure Action**: Block PR merge

#### E2E Tests
- **Trigger**: Before merge to `main`
- **Timeout**: 15 minutes
- **Failure Action**: Block merge

### GitHub Actions Example

```yaml
name: Test Suite

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: docker-compose up -d
      - run: npm run test:e2e
      - run: docker-compose down
```

### Performance Tests

Not included in Phase 1. Plan for Phase 2+:
- Load testing with k6 or Artillery
- Stress testing for scheduler under high event volume
- Database query performance testing

### Security Tests

#### SAST
ESLint with security plugin (runs on every commit)

#### Dependency Scanning
`npm audit` in CI pipeline

```yaml
- name: Security audit
  run: npm audit --audit-level=high
```

---

## Test Naming Conventions

### File Names
- Unit tests: `{ClassName}.test.ts`
- Integration tests: `{AdapterName}.integration.test.ts`
- E2E tests: `{feature-name}.e2e.test.ts`

### Test Descriptions

Use descriptive test names that explain **what** is being tested and **why**:

```typescript
// Good
it('should calculate next birthday in next year when birthday has passed', () => {});
it('should throw InvalidTimezoneError for invalid IANA timezone', () => {});
it('should claim only events with targetTimestampUTC in the past', () => {});

// Bad
it('test user', () => {});
it('should work', () => {});
it('calculates birthday', () => {});
```

---

## Coverage Reports

### Tool
Jest built-in coverage

### Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Critical paths require 100%
    './src/domain/services/TimezoneService.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/application/use-cases/ClaimReadyEventsUseCase.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  }
};
```

### Viewing Reports

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/lcov-report/index.html
```

---
