# Epic 1: Foundation & User Management

**Epic Goal:** Establish the foundational project infrastructure (monorepo setup, TypeScript configuration, Docker environment, PostgreSQL database, CI/CD pipeline) while delivering the first piece of business value: a working REST API for user management that automatically generates timezone-aware birthday events. This epic proves the core domain model works correctly and validates timezone conversion logic early.

---

## Story 1.1: Project Setup & Monorepo Foundation

**As a** developer,
**I want** a properly configured TypeScript monorepo with build tooling and code quality enforcement,
**so that** the project has a solid foundation for development with consistent code standards.

**Acceptance Criteria:**

1. Repository initialized with Git, .gitignore configured for Node.js/TypeScript
2. package.json configured with npm workspaces for monorepo structure
3. TypeScript 5.3.3 installed with strict mode enabled in tsconfig.json (zero `any` types allowed)
4. ESLint 8.56.0 and Prettier 3.2.5 configured and enforced
5. Build scripts configured using esbuild 0.20.0 for fast compilation
6. Pre-commit hooks configured to run linting and formatting
7. README.md created with project overview and setup instructions
8. All code passes linting with 0 errors and <10 warnings

---

## Story 1.2: Docker Development Environment

**As a** developer,
**I want** a Docker Compose environment that runs PostgreSQL and LocalStack,
**so that** I can develop locally without requiring production AWS services.

**Acceptance Criteria:**

1. Docker Compose file created with PostgreSQL 16.1 container
2. LocalStack 3.1.0 container configured for AWS service simulation (SQS, EventBridge, SNS)
3. Environment variables configured via .env file (with .env.example template)
4. Database initialization scripts run automatically on container startup
5. Health check endpoints configured for all services
6. Documentation added to README for starting/stopping Docker environment
7. `docker-compose up -d` successfully starts all services
8. PostgreSQL accessible on localhost:5432 with test connection successful

---

## Story 1.3: Database Schema & Prisma Setup

**As a** developer,
**I want** Prisma ORM configured with PostgreSQL database schema for users and events,
**so that** I have type-safe database access with migration support.

**Acceptance Criteria:**

1. Prisma 5.9.1 installed and initialized
2. Schema defined for `users` table: id (UUID), firstName, lastName, dateOfBirth, timezone, createdAt, updatedAt
3. Schema defined for `events` table: id (UUID), userId (FK), eventType, targetTimestampUTC, targetTimestampLocal, targetTimezone, status (enum: PENDING, PROCESSING, COMPLETED, FAILED), version (for optimistic locking), idempotencyKey, executedAt, failureReason, createdAt, updatedAt
4. Index created on (target_timestamp_utc, status) for efficient scheduler queries
5. Prisma migration created and successfully applied to local database
6. Prisma Client generated with full TypeScript types
7. Database can be reset and reseeded for testing purposes
8. Migration runs successfully in CI/CD environment

---

## Story 1.4: Domain Layer - User & Event Entities

**As a** developer,
**I want** pure domain entities for User and Event with business logic,
**so that** the core domain model is independent of infrastructure concerns.

**Acceptance Criteria:**

1. User entity created in `src/domain/entities/User.ts` with no external dependencies
2. Event entity created in `src/domain/entities/Event.ts` with status state machine
3. Value objects created: Timezone, DateOfBirth, EventStatus (in `src/domain/value-objects/`)
4. User entity validates: firstName/lastName not empty, dateOfBirth not in future, timezone is valid IANA
5. Event entity enforces valid state transitions (PENDING → PROCESSING → COMPLETED/FAILED)
6. Domain entities are immutable (use methods that return new instances for changes)
7. Unit tests achieve 100% coverage for domain entities and value objects
8. All domain code has zero imports from Fastify, Prisma, AWS, or infrastructure layers

---

## Story 1.5: Timezone Service

**As a** developer,
**I want** a domain service that handles timezone conversions using Luxon,
**so that** birthday events are correctly scheduled at 9:00 AM local time.

**Acceptance Criteria:**

1. TimezoneService created in `src/domain/services/TimezoneService.ts`
2. Method `calculateNextBirthday(dateOfBirth, timezone)` returns next birthday at 9:00 AM local time
3. Method `convertToUTC(localTimestamp, timezone)` converts local time to UTC
4. Service correctly handles DST transitions (spring forward, fall back)
5. Service validates timezone against IANA timezone database
6. Unit tests cover timezones: America/New_York, Europe/London, Asia/Tokyo, Australia/Sydney
7. Unit tests cover DST transition edge cases (e.g., March 10, 2024 in New York)
8. Unit tests achieve 100% coverage for TimezoneService

---

## Story 1.6: Repository Port Interfaces

**As a** developer,
**I want** repository port interfaces defined in the application layer,
**so that** domain logic doesn't depend on Prisma or database implementation.

**Acceptance Criteria:**

1. IUserRepository interface created in `src/application/ports/IUserRepository.ts`
2. IEventRepository interface created in `src/application/ports/IEventRepository.ts`
3. IUserRepository defines methods: create, findById, update, delete
4. IEventRepository defines methods: create, findById, update, findReadyEvents, findMissedEvents
5. All interface methods use domain entities (not Prisma models) as parameters/return types
6. Interfaces have no dependencies on Prisma or database specifics
7. Documentation comments explain each method's purpose and behavior
8. TypeScript compilation succeeds with strict mode

---

## Story 1.7: Prisma Repository Implementations

**As a** developer,
**I want** Prisma-based implementations of repository interfaces,
**so that** domain entities can be persisted to PostgreSQL database.

**Acceptance Criteria:**

1. PrismaUserRepository created in `src/adapters/secondary/persistence/PrismaUserRepository.ts`
2. PrismaEventRepository created in `src/adapters/secondary/persistence/PrismaEventRepository.ts`
3. Repositories implement port interfaces (IUserRepository, IEventRepository)
4. Repositories map between Prisma models and domain entities correctly
5. EventRepository.findReadyEvents() uses `FOR UPDATE SKIP LOCKED` for atomic claiming
6. EventRepository includes optimistic locking using version field
7. Integration tests use Testcontainers 10.5.0 for real PostgreSQL testing
8. Integration tests achieve 100% coverage for repository methods

---

## Story 1.8: Create User Use Case

**As a** developer,
**I want** a CreateUser use case that generates a birthday event automatically,
**so that** user creation triggers event scheduling in one atomic operation.

**Acceptance Criteria:**

1. CreateUserUseCase created in `src/application/use-cases/CreateUserUseCase.ts`
2. Use case receives IUserRepository, IEventRepository, and TimezoneService via dependency injection
3. Zod schema defined for CreateUser input (firstName, lastName, dateOfBirth, timezone)
4. TypeScript types derived from Zod schema using `z.infer<typeof CreateUserSchema>`
5. Use case validates input DTO using Zod schema and derived types
6. Use case creates User domain entity
7. Use case calls TimezoneService to calculate next birthday at 9:00 AM local time
8. Use case creates Event domain entity with calculated timestamps
9. Use case saves both user and event in a transaction (both succeed or both fail)
10. Unit tests verify user and event are created atomically with correct timezone calculations

---

## Story 1.9: User CRUD Use Cases & REST API

**As a** developer,
**I want** complete user CRUD use cases with Fastify REST API endpoints,
**so that** users can be managed via HTTP requests.

**Acceptance Criteria:**

1. Zod schemas defined for all operations: CreateUserSchema, UpdateUserSchema, GetUserParamsSchema, UserResponseSchema
2. TypeScript types derived from schemas using `z.infer<>` for use across all layers
3. GetUserUseCase, UpdateUserUseCase, DeleteUserUseCase created using derived types
4. UpdateUserUseCase reschedules pending events when timezone/birthday changes
5. DeleteUserUseCase cancels all pending events for deleted user
6. Fastify 4.26.0 server configured with fastify-type-provider-zod in `src/adapters/primary/http/server.ts`
7. POST /user, GET /user/:id, PUT /user/:id, DELETE /user/:id endpoints implemented with schema validation
8. Routes use Fastify schema property with Zod schemas for automatic validation and type inference
9. All endpoints return appropriate HTTP status codes (200, 201, 400, 404, 500)
10. Zod validation errors automatically mapped to HTTP 400 responses by Fastify
11. Response schemas defined for all endpoints with automatic serialization validation
12. Integration tests verify all CRUD operations work end-to-end with real database
13. Tests verify type safety: schema changes cause TypeScript compilation errors in dependent code

---

## Story 1.10: CI/CD Pipeline Setup

**As a** developer,
**I want** a GitHub Actions CI/CD pipeline that runs tests and linting,
**so that** code quality is enforced automatically on every commit.

**Acceptance Criteria:**

1. GitHub Actions workflow file created (.github/workflows/ci.yml)
2. Workflow runs on push to main branch and all pull requests
3. Workflow steps: install dependencies, run linting, run unit tests, run integration tests
4. Workflow uses PostgreSQL service container for integration tests
5. Workflow fails if linting has errors or warnings >10
6. Workflow fails if test coverage is <80%
7. Workflow fails if any tests fail
8. Workflow status badge added to README.md
