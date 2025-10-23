# Epic 1: Foundation & User Management

**Epic Goal:** Establish the foundational project infrastructure (monorepo setup, TypeScript configuration, Docker environment, PostgreSQL database) while delivering the first piece of business value: a working REST API for user management that automatically generates timezone-aware birthday events via domain events. This epic proves the core domain model works correctly, validates timezone conversion logic early, and implements bounded contexts with physical folder separation for future scalability.

**Story Count:** 12 stories (Originally 8, added 4 for bounded contexts architecture)
**New Stories:** 1.7b (Folder Reorganization), 1.8 (Domain Event Bus), 1.9 (UserCreated Event Handler), 1.10 (Refactored CreateUserUseCase)
**Architecture Decision:** Implemented bounded contexts with domain events to decouple User Context from Event Scheduling Context. Physical folder reorganization (Story 1.7b) enforces context boundaries at filesystem level. See [Bounded Contexts Architecture](../architecture/bounded-contexts.md) and [Scalability Analysis](../architecture/scalability-analysis.md) for rationale.

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

## Story 1.5: Timezone Service & Strategy Pattern Implementation

**As a** developer,
**I want** a timezone conversion utility and Strategy Pattern for event type handling,
**so that** birthday events are correctly scheduled at 9:00 AM local time and the system is extensible for future event types.

**Acceptance Criteria:**

1. TimezoneService created in `src/domain/services/TimezoneService.ts` as pure timezone utility
2. Method `convertToUTC(localTimestamp, timezone)` converts local time to UTC
3. Method `convertToLocalTime(utcTimestamp, timezone)` converts UTC to local time
4. Service correctly handles DST transitions (spring forward, fall back)
5. IEventHandler interface created defining Strategy Pattern contract
6. EventHandlerRegistry created for managing event type strategies
7. BirthdayEventHandler implements calculateNextOccurrence() at 9:00 AM local time
8. Unit tests cover timezones: America/New_York, Europe/London, Asia/Tokyo, Australia/Sydney
9. Unit tests cover DST transition edge cases (e.g., March 10, 2024 in New York)
10. Unit tests achieve 100% coverage for TimezoneService, EventHandlerRegistry, and BirthdayEventHandler

**Implementation Note:** This story implements the Strategy Pattern documented in `docs/architecture/design-patterns.md`, allowing future event types (Anniversary, Reminder, etc.) to be added without modifying core logic.

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

## Story 1.7b: Reorganize to Bounded Context Folder Structure

**As a** developer,
**I want** the codebase organized by bounded contexts (User, Event Scheduling),
**so that** context boundaries are physically enforced and the codebase is ready for future microservice extraction.

**Acceptance Criteria:**

1. New folder structure created: `src/modules/user/`, `src/modules/event-scheduling/`, `src/shared/`
2. All User Context files moved to `src/modules/user/` with domain, application, adapters layers
3. All Event Scheduling Context files moved to `src/modules/event-scheduling/` with domain, application, adapters layers
4. Shared files (Timezone value object, validation schemas) moved to `src/shared/`
5. TypeScript path aliases configured in `tsconfig.json` (`@modules/*`, `@shared/*`)
6. All import paths updated across codebase (relative within modules, path aliases across modules)
7. All existing tests pass with 0 failures after reorganization
8. ESLint and TypeScript compilation succeed with 0 errors
9. Git history preserved (used `git mv` for all file moves)
10. Documentation updated to reflect new folder structure

**Architecture Context:** This story physically separates bounded contexts at the filesystem level, enforcing architectural boundaries and preparing for future microservice extraction. Each `src/modules/*` folder can become a separate repository when scaling to Phase 2 (10K-100K users).

**Design Decision:** User requested early reorganization: "I rather reorganise now than later which will be very hard." At 53 TypeScript files, reorganization is low-risk; postponing until 200+ files increases merge conflict risk.

**See:** [Story 1.7b Details](../stories/1.7b.reorganize-bounded-context-folder-structure.md) | [Bounded Contexts - Folder Structure](../architecture/bounded-contexts.md#folder-structure-logical-vs-physical-separation)

---

## Story 1.8: Domain Event Bus Infrastructure

**As a** developer,
**I want** an event bus abstraction for in-process domain event communication,
**so that** bounded contexts can communicate without direct dependencies.

**Acceptance Criteria:**

1. IDomainEventBus interface created in `src/shared/events/IDomainEventBus.ts`
2. Interface defines: `publish<T>(event: T): Promise<void>` and `subscribe<T>(eventType: string, handler: (event: T) => Promise<void>): void`
3. Base DomainEvent interface created with common properties (eventType, context, occurredAt, aggregateId)
4. InMemoryEventBus implementation created with Map-based handler storage
5. InMemoryEventBus executes handlers sequentially (preserves ordering)
6. InMemoryEventBus logs errors but continues processing other handlers (resilient)
7. Unit tests achieve 100% coverage for InMemoryEventBus
8. All code passes ESLint with 0 errors and strict TypeScript compilation

**Architecture Context:** This story enables bounded context communication via domain events. User Context will publish `UserCreated` events, and Event Scheduling Context will subscribe to generate birthday events. In Phase 2 (10K-100K users), `InMemoryEventBus` can be swapped for `EventBridgeEventBus` with zero code changes in use cases.

**See:** [Story 1.8 Details](../stories/1.8.domain-event-bus.md) | [Bounded Contexts Architecture](../architecture/bounded-contexts.md)

---

## Story 1.9: UserCreated Event Handler

**As a** developer,
**I want** an event handler that listens to UserCreated events and generates birthday events,
**so that** User and Event contexts are decoupled via domain events.

**Acceptance Criteria:**

1. UserCreatedEvent interface created in `src/modules/user/domain/events/UserCreated.ts`
2. CreateBirthdayEventOnUserCreatedHandler created in `src/modules/event-scheduling/application/event-handlers/`
3. Handler depends on: IEventRepository, TimezoneService, EventHandlerRegistry (NO User dependencies)
4. Handler reconstructs User value objects from UserCreatedEvent payload
5. Handler calculates next birthday using BirthdayEventHandler.calculateNextOccurrence()
6. Handler creates Event entity with correct timestamps (9:00 AM local, converted to UTC)
7. Handler persists Event to database via IEventRepository
8. Handler is registered with IDomainEventBus at application startup
9. Unit tests achieve 100% coverage for event handler
10. Integration test verifies end-to-end flow: UserCreated event → Birthday event created

**Architecture Context:** This story moves Event creation logic OUT of User Context INTO Event Scheduling Context. Event creation happens asynchronously after user creation, enabling eventual consistency and future microservice extraction.

**See:** [Story 1.9 Details](../stories/1.9.user-created-event-handler.md) | [Scalability Analysis](../architecture/scalability-analysis.md)

---

## Story 1.10: Create User Use Case (Refactored with Domain Events)

**As a** developer,
**I want** CreateUser use case refactored to publish UserCreated domain events,
**so that** User Context is decoupled from Event Scheduling Context.

**Acceptance Criteria:**

1. CreateUserUseCase refactored in `src/application/use-cases/user/CreateUserUseCase.ts`
2. Use case receives IUserRepository and IDomainEventBus via DI (NO IEventRepository, NO TimezoneService, NO EventHandlerRegistry)
3. Zod schema defined for CreateUser input (firstName, lastName, dateOfBirth, timezone) ✅ Already done
4. TypeScript types derived from Zod schema using `z.infer<typeof CreateUserSchema>` ✅ Already done
5. Use case validates input DTO using Zod schema ✅ Already done
6. Use case creates User domain entity ✅ Already done
7. Use case saves user to database via IUserRepository ✅ Already done
8. Use case publishes UserCreatedEvent to IDomainEventBus (NEW - replaces direct Event creation)
9. UserCreatedEvent contains all user data needed by Event Scheduling Context (NEW)
10. Unit tests verify user created and UserCreated event published (NO direct Event creation)

**Refactoring Note:** This story refactors the DONE Story 1.8 implementation to use domain events. The current implementation creates Events directly (tight coupling); it needs to publish UserCreated events instead. Event creation now happens asynchronously in Story 1.9's event handler.

**See:** [Story 1.10 Details](../stories/1.10.create-user-use-case.md) | [Impact Assessment](../architecture/bounded-contexts-impact-assessment.md)

---

## Story 1.11: User CRUD Use Cases & REST API

**As a** developer,
**I want** complete user CRUD use cases with Fastify REST API endpoints,
**so that** users can be managed via HTTP requests.

**Acceptance Criteria:**

1. Zod schemas defined for all operations: CreateUserSchema, UpdateUserSchema, GetUserParamsSchema, UserResponseSchema
2. TypeScript types derived from schemas using `z.infer<>` for use across all layers
3. GetUserUseCase, UpdateUserUseCase, DeleteUserUseCase created using derived types
4. DeleteUserUseCase cancels all pending events for deleted user
5. Fastify 4.26.0 server configured with fastify-type-provider-zod in `src/adapters/primary/http/server.ts`
6. POST /user, GET /user/:id, PUT /user/:id, DELETE /user/:id endpoints implemented with schema validation
7. Routes use Fastify schema property with Zod schemas for automatic validation and type inference
8. All endpoints return appropriate HTTP status codes (200, 201, 400, 404, 500)
9. Zod validation errors automatically mapped to HTTP 400 responses by Fastify
10. Response schemas defined for all endpoints with automatic serialization validation
11. Integration tests verify all CRUD operations work end-to-end with real database
12. Tests verify type safety: schema changes cause TypeScript compilation errors in dependent code

**UpdateUserUseCase Event Rescheduling Logic:**

13. When user birthday is updated (dateOfBirth field):
    - Query for PENDING events for this user with eventType='BIRTHDAY'
    - If PENDING event exists:
      - Update targetTimestampUTC to new birthday at 9:00 AM in user's current timezone
      - Update targetTimestampLocal field to reflect new local time
      - Update dateOfBirth reference in event metadata
    - If new birthday date has already passed this year, set targetTimestamp for next year's birthday
    - Do NOT modify events with status PROCESSING, COMPLETED, or FAILED (these are historical)

14. When user timezone is updated (timezone field):
    - Query for PENDING events for this user
    - For each PENDING event:
      - Recalculate targetTimestampUTC to maintain same local time (9:00 AM) in new timezone
      - Update targetTimezone field to new timezone value
      - Keep targetTimestampLocal unchanged (still 9:00 AM local)
    - Do NOT modify events with status PROCESSING, COMPLETED, or FAILED

15. When both birthday AND timezone updated in single request:
    - Apply birthday update logic first (new date)
    - Then apply timezone update logic (new timezone for new date)
    - Ensure atomic transaction (both user update and event reschedule succeed or both fail)

16. Unit tests verify rescheduling logic:
    - Birthday changed before current year's event executes: event updated to new date
    - Birthday changed after current year's event passed: new event created for next year
    - Timezone changed: event time recalculated to maintain 9:00 AM local in new timezone
    - Both birthday and timezone changed: both updates applied atomically
    - Events in PROCESSING/COMPLETED/FAILED status are never modified
    - Edge case: Birthday changed to Feb 29 in non-leap year handled correctly (Mar 1)

17. Integration tests verify database transactions:
    - User update and event reschedule succeed together or fail together
    - No orphaned events after failed user update
    - Concurrent user updates don't create duplicate events (optimistic locking tested)
