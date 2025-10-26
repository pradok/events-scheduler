# Testing Guide

**Practical guide for running and writing tests**

For testing philosophy and architecture decisions, see [Test Strategy](./architecture/test-strategy.md).

---

## Quick Start

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit           # Fast unit tests (seconds)
npm run test:integration    # Integration tests with database (1-2 min)
npm run test:e2e            # End-to-end tests with LocalStack (2-3 min)

# Generate coverage report
npm run test:coverage
```

---

## Test Types

### Unit Tests

**Purpose:** Test business logic in isolation (no database, no external services)

**Speed:** ⚡ Very fast (< 1 second per test)

**Run:**

```bash
npm run test:unit
```

**Location:** Colocated with source files

```
src/modules/user/domain/entities/User.ts
src/modules/user/domain/entities/User.test.ts  ← Unit test
```

**What gets mocked:**

- Repositories
- External services
- Message queues

**Example test:**

```typescript
describe('User', () => {
  it('should calculate next birthday correctly', () => {
    // Arrange
    const user = new User({
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new DateOfBirth('1990-03-15'),
      timezone: new Timezone('America/New_York')
    });

    // Act
    const handler = new BirthdayEventHandler();
    const nextBirthday = handler.calculateNextOccurrence(user);

    // Assert
    expect(nextBirthday.month).toBe(3);
    expect(nextBirthday.day).toBe(15);
  });
});
```

---

### Integration Tests

**Purpose:** Test components with real database (Testcontainers PostgreSQL)

**Speed:** 🐢 Slower (~5-10 seconds per test)

**Run:**

```bash
npm run test:integration
```

**Location:** Colocated with adapters

```
src/modules/user/adapters/persistence/PrismaUserRepository.ts
src/modules/user/adapters/persistence/PrismaUserRepository.integration.test.ts  ← Integration test
```

**What's real:**

- ✅ PostgreSQL database (Testcontainers)
- ✅ Prisma Client
- ✅ Database transactions

**What gets mocked:**

- ❌ SQS / EventBridge
- ❌ External webhooks

**Example test:**

```typescript
describe('PrismaUserRepository', () => {
  let container: PostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    // Start real PostgreSQL
    container = await new PostgreSqlContainer('postgres:16').start();
    prisma = new PrismaClient({
      datasources: { db: { url: container.getConnectionString() } }
    });
    repository = new PrismaUserRepository(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it('should create and retrieve user', async () => {
    // Arrange
    const user = new User({ /* ... */ });

    // Act
    await repository.create(user);
    const retrieved = await repository.findById(user.id);

    // Assert
    expect(retrieved).toBeDefined();
    expect(retrieved?.firstName).toBe(user.firstName);
  });
});
```

**Setup/Cleanup:**

Tests automatically:

- Start PostgreSQL container (`beforeAll`)
- Run migrations
- Clean data between tests (`afterEach`)
- Stop container (`afterAll`)

**Scripts:** `scripts/integration-test-setup.sh` and `scripts/integration-test-cleanup.sh`

---

### End-to-End Tests

**Purpose:** Test complete flows with LocalStack + database

**Speed:** 🐌 Slowest (~30-60 seconds per test)

**Run:**

```bash
npm run test:e2e
```

**Location:** `tests/e2e/`

```
tests/e2e/
├── complete-birthday-flow.e2e.test.ts
└── recovery-flow.e2e.test.ts
```

**What's real:**

- ✅ PostgreSQL (Testcontainers)
- ✅ LocalStack (SQS, Lambda, EventBridge)
- ✅ Lambda deployment
- ✅ Full system integration

**What gets mocked:**

- ❌ External webhooks (mock server)

**Example test:**

```typescript
describe('Complete Birthday Flow E2E', () => {
  it('should create user → generate event → schedule → deliver', async () => {
    // 1. Create user
    const user = await createTestUser({
      dateOfBirth: '1990-01-15',
      timezone: 'America/New_York'
    });

    // 2. Verify event generated
    const event = await prisma.event.findFirst({
      where: { userId: user.id, status: 'PENDING' }
    });
    expect(event).toBeDefined();

    // 3. Trigger scheduler Lambda
    await invokeLambda('event-scheduler');

    // 4. Verify event claimed
    const claimedEvent = await prisma.event.findUnique({
      where: { id: event.id }
    });
    expect(claimedEvent.status).toBe('PROCESSING');

    // 5. Verify SQS message sent
    const messages = await receiveSQSMessages();
    expect(messages).toHaveLength(1);

    // 6. Process worker Lambda
    await invokeLambda('event-worker');

    // 7. Verify webhook delivered
    expect(mockWebhookServer.requests).toHaveLength(1);

    // 8. Verify event completed
    const completedEvent = await prisma.event.findUnique({
      where: { id: event.id }
    });
    expect(completedEvent.status).toBe('COMPLETED');
  });
});
```

**Setup/Cleanup:**

- Start PostgreSQL (Testcontainers)
- Start LocalStack (Docker)
- Deploy Lambdas
- Start mock webhook server
- Clean up after tests

**Scripts:** `scripts/e2e-test-setup.sh` and `scripts/e2e-test-cleanup.sh`

---

## Running Tests

### Run All Tests

```bash
npm test
```

Runs unit tests ONLY (fast feedback). Integration and E2E tests are excluded by default.

### Run Tests by Type

```bash
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e            # E2E tests only
npm run test:all            # Literally everything (slow)
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

**Use for:** TDD workflow - tests re-run on file changes

### Run Specific Test File

```bash
npm test -- User.test.ts
npm test -- CreateUserUseCase
```

### Run Tests Matching Pattern

```bash
npm test -- --testNamePattern="should calculate next birthday"
```

### Generate Coverage Report

```bash
npm run test:coverage
```

**View report:**

```bash
open coverage/lcov-report/index.html
```

**Coverage goals:**

- Overall: ≥80%
- Critical paths: 100% (scheduler, executor, domain entities)

---

## Writing Tests

### Test Structure (AAA Pattern)

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do expected behavior when condition', () => {
      // Arrange - Set up test data and mocks
      const user = createTestUser();
      const mockRepo = createMockRepository();

      // Act - Execute the code under test
      const result = user.someMethod();

      // Assert - Verify expectations
      expect(result).toBe(expectedValue);
    });
  });
});
```

### Naming Conventions

**Good test names:**

```typescript
it('should calculate next birthday in same year when birthday has not passed')
it('should throw InvalidTimezoneError for invalid IANA timezone')
it('should claim only events with targetTimestampUTC in the past')
```

**Bad test names:**

```typescript
it('test user')  // Too vague
it('should work')  // Doesn't explain what works
it('calculates birthday')  // Incomplete
```

### Test Data Builders

Use builder pattern for clean test data creation:

```typescript
// Good - Fluent, readable
const user = new UserBuilder()
  .withTimezone('Europe/London')
  .withDateOfBirth('1990-03-15')
  .build();

// Bad - Verbose, repetitive
const user = new User({
  id: UUID.generate(),
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: new DateOfBirth('1990-03-15'),
  timezone: new Timezone('Europe/London'),
  createdAt: DateTime.now(),
  updatedAt: DateTime.now()
});
```

**Location:** `tests/helpers/builders/`

```
tests/helpers/builders/
├── UserBuilder.ts
├── EventBuilder.ts
└── index.ts
```

**Example builder:**

```typescript
export class EventBuilder {
  private id = UUID.generate();
  private userId: UUID;
  private status = EventStatus.PENDING;
  private targetTimestampUTC = DateTime.now().plus({ days: 1 });

  forUser(userId: UUID): this {
    this.userId = userId;
    return this;
  }

  thatIsOverdue(): this {
    this.targetTimestampUTC = DateTime.now().minus({ hours: 2 });
    return this;
  }

  thatIsFailed(): this {
    this.status = EventStatus.FAILED;
    this.retryCount = 3;
    return this;
  }

  build(): Event {
    return new Event({ /* ... */ });
  }
}
```

**Usage:**

```typescript
const overdueEvent = new EventBuilder()
  .forUser(userId)
  .thatIsOverdue()
  .build();
```

---

## Mocking

### Mocking Repositories

```typescript
const mockUserRepository: jest.Mocked<IUserRepository> = {
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};

// Setup mock return value
mockUserRepository.findById.mockResolvedValue(testUser);

// Verify mock was called
expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
```

### Mocking External Services

```typescript
const mockWebhookAdapter: jest.Mocked<IWebhookDeliveryAdapter> = {
  deliver: jest.fn()
};

mockWebhookAdapter.deliver.mockResolvedValue({
  success: true,
  statusCode: 200
});
```

### Mocking Dates/Time

```typescript
// Mock current time
jest.useFakeTimers();
jest.setSystemTime(new Date('2025-03-15T09:00:00Z'));

// Run test
const result = someMethod();

// Restore real timers
jest.useRealTimers();
```

---

## Test Configuration

### Jest Configuration

**Location:** `jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/*.test.ts',
    '**/*.integration.test.ts',
    '**/*.e2e.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### Test Timeouts

```typescript
// Increase timeout for slow tests
describe('E2E Tests', () => {
  jest.setTimeout(120000); // 2 minutes

  it('should complete full flow', async () => {
    // Test implementation
  }, 60000); // 1 minute for this specific test
});
```

---

## Debugging Tests

### Run Tests with Debugging

```bash
# VSCode: Add breakpoint, press F5, select "Jest Current File"

# Or use Node.js inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

### View Detailed Test Output

```bash
npm test -- --verbose
```

### Run Single Test File

```bash
npm test -- User.test.ts --verbose
```

### Skip Tests Temporarily

```typescript
it.skip('should do something', () => {
  // Test skipped
});

describe.skip('Feature X', () => {
  // All tests in this describe block skipped
});
```

### Focus on Specific Test

```typescript
it.only('should do this specific thing', () => {
  // Only this test runs
});
```

**WARNING:** Don't commit `.only` - it breaks CI/CD!

---

## Continuous Testing

### Pre-commit Hook

Tests run automatically before git commits (Husky):

```bash
# .husky/pre-commit
npm run test:unit
npm run lint
```

### Watch Mode During Development

```bash
npm run test:watch
```

**Use for:**

- TDD workflow
- Refactoring
- Real-time feedback

---

## Common Issues

### Tests fail with "Cannot find module"

```bash
# Regenerate Prisma Client
npm run prisma:generate
```

### Integration tests can't connect to database

```bash
# Check Docker is running
docker ps

# Check Testcontainers logs
npm run test:integration -- --verbose
```

### E2E tests timeout

```bash
# Increase timeout
jest.setTimeout(180000); // 3 minutes

# Check LocalStack is running
npm run docker:verify
```

### Coverage report not generated

```bash
# Clean coverage directory
rm -rf coverage
npm run test:coverage
```

---

## Next Steps

- **Test Strategy:** See [Architecture: Test Strategy](./architecture/test-strategy.md)
- **Debugging:** See [Debugging Guide](./debugging.md)
- **Local Development:** See [Local Development Guide](./local-development.md)

---

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/)
- [Test Strategy](./architecture/test-strategy.md) - Philosophy and patterns
