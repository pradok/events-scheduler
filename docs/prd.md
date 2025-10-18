# Time-Based Event Scheduling System Product Requirements Document (PRD)

_Document Status: In Progress - Draft_
_Last Updated: 2025-10-19_

---

## Goals and Background Context

### Goals

- Deliver a reliable, timezone-aware birthday messaging system (Phase 1 MVP) that demonstrates platform capabilities
- Achieve 100% timezone accuracy with messages delivered at exactly 9:00 AM local time (±5 minutes)
- Guarantee exactly-once message delivery with zero duplicates under any failure scenario
- Implement automatic failure recovery that catches up on missed events after 24-hour downtime without manual intervention
- Establish extensible architecture foundation that supports future event types (anniversaries, reminders, subscriptions) without core modifications
- Validate architectural patterns (DDD, Hexagonal Architecture) with 80%+ test coverage and production-ready code quality

### Background Context

Modern applications serve globally distributed users who expect personalized, timely interactions in their local timezone context. However, existing solutions for time-based event scheduling fail to address three critical challenges: timezone complexity (DST transitions, user relocation), exactly-once delivery guarantees (race conditions, retry logic), and automatic failure recovery (distinguishing "never sent" vs "sent but status update failed"). Development teams currently invest 40+ hours researching timezone libraries and building fragile custom solutions that accumulate technical debt.

This PRD defines Phase 1 MVP requirements for a birthday messaging system built on serverless architecture that solves these challenges through timezone intelligence, atomic event claiming, and self-healing recovery. The platform starts with birthday messaging while establishing the architectural foundation for any time-based event system, enabling future expansion to anniversaries, reminders, subscription renewals, and custom event types.

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-10-19 | 1.0 | Initial PRD draft from project brief | PM Agent (John) |

---

## Requirements

### Functional Requirements

#### User Management

- FR1: System shall provide REST API endpoint to create users with firstName, lastName, dateOfBirth (YYYY-MM-DD), and timezone (IANA format)
- FR2: System shall provide REST API endpoint to retrieve user details by user ID
- FR3: System shall provide REST API endpoint to update user details including birthday and timezone
- FR4: System shall provide REST API endpoint to delete users and automatically cancel associated pending events
- FR5: System shall validate all user inputs including date formats and IANA timezone identifiers

#### Event Scheduling

- FR6: System shall automatically generate birthday event when user is created
- FR7: System shall calculate target execution time as 9:00 AM in user's local timezone and convert to UTC for storage
- FR8: System shall handle Daylight Saving Time transitions automatically using IANA timezone database
- FR9: System shall automatically generate next year's birthday event after current year executes
- FR10: System shall update/reschedule pending events when user timezone or birthday changes

#### Event Execution

- FR11: System shall run scheduler every 1 minute to query for events where targetTimestampUTC <= NOW() AND status = 'PENDING'
- FR12: System shall claim events atomically using database locking to prevent race conditions
- FR13: System shall send event details to queue for asynchronous processing
- FR14: System shall execute webhook POST delivery with message format: `{"message": "Hey, {firstName} {lastName} it's your birthday"}`
- FR15: System shall implement retry logic with 3 attempts and exponential backoff (1s, 2s, 4s)
- FR16: System shall transition event status through state machine: PENDING → PROCESSING → COMPLETED or FAILED

#### Exactly-Once Delivery

- FR17: System shall use optimistic locking with version numbers on events to prevent concurrent updates
- FR18: System shall enforce valid state transitions through state machine implementation
- FR19: System shall use idempotency keys for external webhook calls to prevent duplicate delivery
- FR20: System shall ensure atomic status updates using database transactions

#### Automatic Recovery (Critical)

- FR21: System shall automatically detect missed events on startup by querying events where targetTimestampUTC < NOW() AND status = 'PENDING'
- FR22: System shall execute all missed events automatically without manual intervention
- FR23: System shall add "late execution" flag to logs for all recovered events
- FR24: System shall maintain same idempotency protections during recovery to prevent duplicates
- FR25: System shall handle multiple restart scenarios without re-sending already completed events
- FR26: System shall correctly handle partial failures where recovery crashes mid-execution
- FR27: System shall route events to Dead Letter Queue after max retry exhaustion

### Non-Functional Requirements

#### Performance

- NFR1: API endpoints shall respond within 200ms at 95th percentile for CRUD operations
- NFR2: System shall process 100+ birthday events per minute without failures or delays
- NFR3: Events shall execute within 1 minute of target time under normal conditions
- NFR4: System shall handle 1000 users and 100+ concurrent same-day birthdays without issues
- NFR5: Recovery shall catch up on 100 missed events within 5 minutes of restart

#### Reliability

- NFR6: System shall achieve 100% timezone accuracy with messages at correct local time (9:00 AM ±5 minutes)
- NFR7: System shall achieve zero duplicate messages under any scenario (concurrent schedulers, retries, recovery)
- NFR8: System shall achieve 100% recovery of missed events after 24-hour downtime without duplicates
- NFR9: Event success rate shall be ≥99% (events transition to COMPLETED status)
- NFR10: Dead Letter Queue size shall be <1% of total events

#### Code Quality

- NFR11: Test coverage shall be ≥80% overall with 100% coverage for critical paths (scheduler, executor, timezone service)
- NFR12: Codebase shall use TypeScript strict mode with zero `any` types in production code
- NFR13: Linting violations shall be 0 errors with <10 warnings
- NFR14: All tests shall pass in CI/CD pipeline before deployment

#### Development Environment

- NFR15: System shall run successfully on LocalStack for local development without production AWS
- NFR16: Docker Compose setup shall work end-to-end for local development
- NFR17: System shall support English-only messages and documentation for Phase 1

#### Observability

- NFR18: Late execution flag shall be logged for all recovered events
- NFR19: Logs shall include how late event is, original target time, actual execution time
- NFR20: Metrics shall distinguish between on-time execution and recovery execution
- NFR21: All logs shall use structured JSON format for CloudWatch compatibility

---

## Technical Assumptions

### Repository Structure: Monorepo

Single repository containing all services (API, Scheduler, Worker), shared domain logic, and infrastructure definitions using npm workspaces. This simplifies dependency management, enables atomic cross-service changes, and supports the hexagonal architecture's emphasis on shared domain entities.

### Service Architecture: Modular Monolith with Deployment Flexibility

**Primary Pattern:** Hexagonal Architecture (Ports & Adapters) + Domain-Driven Design

**Logical Services:**
- API Gateway (Fastify REST API)
- Scheduler (EventBridge-triggered Lambda)
- Worker/Executor (SQS-triggered Lambda)

**Deployment Options:**
- Lambda functions (production serverless)
- Single Node process with background workers (local development)
- Container deployment (Docker Compose for integration testing)

**Key Principle:** Same codebase, swappable adapters for different deployment models. Domain layer has zero dependencies on frameworks, databases, or AWS services.

### Testing Requirements

**Full Testing Pyramid Required:**

- **Unit Tests:** Domain entities, value objects, domain services (100% coverage for critical paths)
- **Integration Tests:** Repository implementations, database interactions, timezone conversions
- **End-to-End Tests:** Complete workflows including recovery scenarios, race conditions, concurrent schedulers
- **Testing Tools:** Jest 29.7.0, Testcontainers 10.5.0 for database testing
- **Coverage Target:** ≥80% overall, 100% for scheduler, executor, timezone service
- **Time Mocking:** Required for deterministic time-based testing

### Additional Technical Assumptions and Requests

#### Core Technology Stack

- **Language:** TypeScript 5.3.3 with strict mode (zero `any` types allowed)
- **Runtime:** Node.js 20.11.0 LTS
- **Framework:** Fastify 4.26.0 for REST API with fastify-type-provider-zod 2.0.0
- **ORM:** Prisma 5.9.1 for type-safe database access
- **Database:** PostgreSQL 16.1 (RDS for production, Docker for local)
- **Date/Time:** Luxon 3.4.4 with IANA timezone database
- **Validation:** Zod 3.25.1 for runtime schema validation and type derivation
- **Logger:** Pino 8.17.2 (structured JSON for CloudWatch, native Fastify integration)

#### AWS Services

- EventBridge (scheduler triggers every 1 minute)
- Lambda (compute for scheduler and workers)
- SQS (message queue for event buffering)
- RDS PostgreSQL (primary database with ACID transactions)
- SNS (future Phase 2: SMS delivery)
- SES (future Phase 2: email delivery)
- CloudWatch (logs and metrics)

#### Development Environment

- Docker 24.0.7 + Docker Compose for local development
- LocalStack 3.1.0 for AWS service simulation (no production AWS required for Phase 1)
- GitHub Actions for CI/CD
- AWS CDK 2.122.0 for Infrastructure as Code (Phase 2+)

#### Code Quality Standards

- ESLint 8.56.0 (0 errors, <10 warnings)
- Prettier 3.2.5 (enforced formatting)
- TypeScript strict mode (100% compliance)
- Conventional commits for Git history

#### Critical Database Features Required

- `FOR UPDATE SKIP LOCKED` for atomic event claiming (prevents race conditions)
- ACID transactions for exactly-once guarantees
- Index on `(target_timestamp_utc, status)` for scheduler queries
- Optimistic locking with version fields

#### Deployment Portability Requirements

- Domain layer must have zero dependencies on AWS, Fastify, Prisma, or any infrastructure
- Use cases receive port implementations via dependency injection
- Primary adapters (HTTP, Lambda, CLI) wrap the same use cases
- Secondary adapters (Prisma, SQS, Webhooks) implement port interfaces

#### Phase 1 Constraints & Delivery Mechanism

**Message Delivery Assumption:**
- Original brief specifies: "send message via call to request bin endpoint (or a similar service)"
- **Interpretation:** RequestBin is a webhook testing service → MVP uses **webhook/HTTP POST delivery**
- **Rationale:** Webhook delivery is the most flexible MVP approach, allowing integration with any external service
- **Future Phases:** Architecture supports additional delivery channels (SMS via SNS, Email via SES, direct database write, etc.)

**Phase 1 Constraints:**
- English-only messages and logs
- Webhook delivery only (no SMS/Email delivery in Phase 1)
- Single-tenant (no multi-tenancy)
- No authentication/authorization
- No production deployment (local development only with LocalStack)

---

## Epic List

### Epic 1: Foundation & User Management
Establish project infrastructure (TypeScript setup, Docker, PostgreSQL, CI/CD) and deliver basic user CRUD API with timezone-aware birthday event generation.

### Epic 2: Event Scheduling & Execution
Implement the core scheduler (EventBridge + polling), atomic event claiming, SQS queue integration, and webhook executor with exactly-once delivery guarantees.

### Epic 3: Automatic Recovery & Reliability
Build self-healing recovery mechanism, comprehensive failure handling, Dead Letter Queue, and complete observability (logging, metrics, late execution tracking).

### Epic 4: Testing & Production Readiness
Comprehensive test suite (unit, integration, E2E), recovery scenario testing, performance validation, and documentation completion.

---

## Epic Details

### Epic 1: Foundation & User Management

**Epic Goal:** Establish the foundational project infrastructure (monorepo setup, TypeScript configuration, Docker environment, PostgreSQL database, CI/CD pipeline) while delivering the first piece of business value: a working REST API for user management that automatically generates timezone-aware birthday events. This epic proves the core domain model works correctly and validates timezone conversion logic early.

#### Story 1.1: Project Setup & Monorepo Foundation

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

#### Story 1.2: Docker Development Environment

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

#### Story 1.3: Database Schema & Prisma Setup

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

#### Story 1.4: Domain Layer - User & Event Entities

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

#### Story 1.5: Timezone Service

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

#### Story 1.6: Repository Port Interfaces

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

#### Story 1.7: Prisma Repository Implementations

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

#### Story 1.8: Create User Use Case

**As a** developer,
**I want** a CreateUser use case that generates a birthday event automatically,
**so that** user creation triggers event scheduling in one atomic operation.

**Acceptance Criteria:**

1. CreateUserUseCase created in `src/application/use-cases/CreateUserUseCase.ts`
2. Use case receives IUserRepository, IEventRepository, and TimezoneService via dependency injection
3. Use case validates input DTO using Zod schema
4. Use case creates User domain entity
5. Use case calls TimezoneService to calculate next birthday at 9:00 AM local time
6. Use case creates Event domain entity with calculated timestamps
7. Use case saves both user and event in a transaction (both succeed or both fail)
8. Unit tests verify user and event are created atomically with correct timezone calculations

#### Story 1.9: User CRUD Use Cases & REST API

**As a** developer,
**I want** complete user CRUD use cases with Fastify REST API endpoints,
**so that** users can be managed via HTTP requests.

**Acceptance Criteria:**

1. Zod schemas defined for all operations with derived TypeScript types
2. GetUserUseCase, UpdateUserUseCase, DeleteUserUseCase created using derived types
3. UpdateUserUseCase reschedules pending events when timezone/birthday changes
4. DeleteUserUseCase cancels all pending events for deleted user
5. Fastify 4.26.0 server configured with fastify-type-provider-zod in `src/adapters/primary/http/server.ts`
6. POST /user, GET /user/:id, PUT /user/:id, DELETE /user/:id endpoints implemented with schema validation
7. All endpoints use Zod schemas for automatic validation and type inference
8. All endpoints return appropriate HTTP status codes (200, 201, 400, 404, 500)
9. Integration tests verify all CRUD operations work end-to-end with real database

#### Story 1.10: CI/CD Pipeline Setup

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

---

### Epic 2: Event Scheduling & Execution

**Epic Goal:** Implement the core event scheduling loop that queries for ready events every minute, claims them atomically to prevent race conditions, queues them for asynchronous execution via SQS, and delivers birthday messages via webhook with exactly-once delivery guarantees. This epic completes the end-to-end birthday messaging capability.

#### Story 2.1: Event Scheduler - Polling & Query Logic

**As a** developer,
**I want** a scheduler that polls the database every minute for ready events,
**so that** events are detected and processed as soon as they're due.

**Acceptance Criteria:**

1. SchedulerService created in `src/application/use-cases/SchedulerService.ts`
2. Service queries events where `targetTimestampUTC <= NOW() AND status = 'PENDING'`
3. Query uses `FOR UPDATE SKIP LOCKED` to prevent concurrent scheduler instances from claiming same events
4. Query limits results to 100 events per run to prevent overwhelming the system
5. Service uses optimistic locking (version field) as secondary safeguard
6. Service updates claimed events to `PROCESSING` status atomically
7. Unit tests verify query logic with mocked repository
8. Integration tests verify atomic claiming works with real database

#### Story 2.2: SQS Queue Integration

**As a** developer,
**I want** an SQS adapter that sends claimed events to a queue,
**so that** scheduling is decoupled from execution for better scalability.

**Acceptance Criteria:**

1. ISQSClient port interface created in `src/application/ports/ISQSClient.ts`
2. SQSAdapter implementation created in `src/adapters/secondary/messaging/SQSAdapter.ts`
3. Adapter configured to use LocalStack SQS for local development
4. Adapter sends event details as JSON message to queue
5. Adapter includes message attributes: eventId, eventType, idempotencyKey
6. Adapter handles SQS errors gracefully with logging
7. LocalStack SQS queue created automatically on startup
8. Integration tests verify messages are sent to queue successfully

#### Story 2.3: EventBridge Scheduler Trigger

**As a** developer,
**I want** EventBridge to trigger the scheduler Lambda every minute,
**so that** the system continuously polls for ready events.

**Acceptance Criteria:**

1. EventBridge rule configured in LocalStack to trigger every 1 minute
2. Lambda handler created in `src/adapters/primary/lambda/schedulerHandler.ts`
3. Handler wraps SchedulerService use case with dependency injection
4. Handler logs start/end of each execution with timestamp
5. Handler catches and logs errors without crashing
6. Handler reports metrics: events found, events claimed, errors
7. LocalStack configuration tested with manual EventBridge trigger
8. Documentation added for running scheduler locally

#### Story 2.4: Webhook Delivery Adapter

**As a** developer,
**I want** a webhook adapter that posts birthday messages to external URLs,
**so that** events can be delivered to third-party services.

**Acceptance Criteria:**

1. IWebhookClient port interface created in `src/application/ports/IWebhookClient.ts`
2. WebhookAdapter implementation created using Axios 1.6.7
3. Adapter sends POST request with JSON body: `{"message": "Hey, {firstName} {lastName} it's your birthday"}`
4. Adapter includes idempotency key in request headers (X-Idempotency-Key)
5. Adapter implements retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
6. Adapter distinguishes between transient (5xx, timeout) and permanent (4xx) failures
7. Adapter logs all requests and responses with correlation IDs
8. Unit tests verify retry logic and error handling

#### Story 2.5: Event Executor Use Case

**As a** developer,
**I want** an event executor use case that delivers messages and updates status,
**so that** events transition through the complete lifecycle.

**Acceptance Criteria:**

1. ExecuteEventUseCase created in `src/application/use-cases/ExecuteEventUseCase.ts`
2. Use case retrieves event from repository by ID
3. Use case validates event status is `PROCESSING` before execution
4. Use case calls WebhookClient to deliver message
5. Use case updates event status to `COMPLETED` on success with executedAt timestamp
6. Use case updates event status to `FAILED` on permanent failure with failureReason
7. Use case leaves event in `PROCESSING` on transient failure (SQS will retry)
8. Unit tests verify all status transition scenarios

#### Story 2.6: Worker Lambda - SQS Consumer

**As a** developer,
**I want** a worker Lambda that consumes events from SQS queue,
**so that** events are executed asynchronously from scheduling.

**Acceptance Criteria:**

1. Lambda handler created in `src/adapters/primary/lambda/workerHandler.ts`
2. Handler configured to be triggered by SQS messages (batch size: 10)
3. Handler wraps ExecuteEventUseCase with dependency injection
4. Handler processes each message in batch independently
5. Handler deletes message from queue only after successful execution
6. Handler logs processing results for each message
7. LocalStack SQS trigger configured and tested
8. Integration tests verify end-to-end flow from queue to execution

#### Story 2.7: Idempotency Key Generation

**As a** developer,
**I want** unique idempotency keys generated for each event,
**so that** duplicate deliveries are prevented even if executor runs multiple times.

**Acceptance Criteria:**

1. Idempotency key generated when event is created (format: `evt-{eventId}-{timestamp}`)
2. Key stored in events table and included in webhook headers
3. Same key used for all retry attempts of the same event
4. Documentation added explaining idempotency key purpose
5. Unit tests verify key format and uniqueness
6. Integration tests verify webhook receives consistent idempotency key on retries
7. External webhook service (RequestBin) can be configured to respect idempotency keys
8. Logs include idempotency key for request tracing

#### Story 2.8: Event State Machine Enforcement

**As a** developer,
**I want** strict enforcement of event status transitions,
**so that** invalid state changes are prevented.

**Acceptance Criteria:**

1. Event entity validates state transitions in domain layer
2. Valid transitions: PENDING → PROCESSING, PROCESSING → COMPLETED, PROCESSING → FAILED
3. Invalid transitions throw domain errors (e.g., COMPLETED → PROCESSING)
4. Repository layer enforces state machine rules before persistence
5. Concurrent update attempts detected via optimistic locking (version mismatch)
6. Failed optimistic lock updates are logged and not retried (event already claimed)
7. Unit tests cover all valid and invalid transition scenarios
8. Integration tests verify state machine works with concurrent updates

#### Story 2.9: Next Year Event Generation

**As a** developer,
**I want** automatic generation of next year's birthday event after current year completes,
**so that** users continue receiving birthday messages annually.

**Acceptance Criteria:**

1. ExecuteEventUseCase checks if current year's birthday was executed
2. After marking event COMPLETED, use case generates next year's event
3. Next year event has targetTimestamp calculated for next birthday at 9:00 AM local time
4. Next year event handles leap year edge case (Feb 29 → Mar 1 in non-leap years)
5. Next year event created in same transaction as status update (both succeed or both fail)
6. Only COMPLETED events trigger next year generation (not FAILED events)
7. Unit tests verify next year event creation with correct timestamps
8. Integration tests verify annual event chain works across multiple years

#### Story 2.10: End-to-End Scheduling Flow Test

**As a** developer,
**I want** comprehensive E2E tests for the complete scheduling flow,
**so that** I can verify the entire system works together correctly.

**Acceptance Criteria:**

1. E2E test creates user with birthday tomorrow
2. Test advances time to trigger event (using time mocking or fast-forward)
3. Test verifies scheduler finds and claims event
4. Test verifies event sent to SQS queue
5. Test verifies worker processes message and delivers webhook
6. Test verifies event status updated to COMPLETED
7. Test verifies next year's event was created
8. Test completes in <30 seconds with all assertions passing

---

### Epic 3: Automatic Recovery & Reliability

**Epic Goal:** Implement the self-healing recovery mechanism that automatically detects and executes missed events after system downtime, comprehensive failure handling with Dead Letter Queue, and complete observability through structured logging and metrics. This epic delivers the critical "automatic recovery" differentiator.

#### Story 3.1: Recovery Service - Missed Event Detection

**As a** developer,
**I want** a recovery service that automatically detects missed events on startup,
**so that** events missed during downtime are identified without manual intervention.

**Acceptance Criteria:**

1. RecoveryService created in `src/application/use-cases/RecoveryService.ts`
2. Service queries events where `targetTimestampUTC < NOW() AND status = 'PENDING'`
3. Query ordered by targetTimestampUTC ASC (oldest events first)
4. Query limited to 1000 events per recovery batch to prevent overflow
5. Service logs total count of missed events found
6. Service logs oldest and newest missed event timestamps
7. Unit tests verify query logic with various downtime scenarios
8. Integration tests verify missed events detected correctly

#### Story 3.2: Recovery Execution with Late Flag

**As a** developer,
**I want** missed events executed with a "late execution" flag in logs,
**so that** recovery operations are distinguishable from normal execution.

**Acceptance Criteria:**

1. RecoveryService sends missed events to SQS with metadata flag `lateExecution: true`
2. ExecuteEventUseCase checks for late execution flag
3. Late execution logged with additional context: how late, original target time, actual execution time
4. Late execution metrics tracked separately from on-time execution
5. Recovery service logs progress: "Recovering 50 missed events..."
6. Recovery completion logged: "Recovery complete: 50 events queued"
7. Unit tests verify late execution flag propagates correctly
8. Integration tests verify late execution logging appears in output

#### Story 3.3: Recovery Performance Optimization

**As a** developer,
**I want** recovery to process 100 missed events within 5 minutes,
**so that** system catches up quickly after downtime.

**Acceptance Criteria:**

1. RecoveryService processes events in batches of 100 for SQS efficiency
2. SQS batch send used instead of individual message sends
3. Recovery doesn't block normal scheduler execution (runs asynchronously)
4. Worker Lambda configured with sufficient concurrency (at least 10 concurrent executions)
5. Performance test creates 100 missed events and measures recovery time
6. Recovery completes within 5 minutes for 100 events
7. Recovery doesn't impact normal event processing (tested with concurrent events)
8. Metrics logged: recovery start time, end time, total duration, events recovered

#### Story 3.4: Duplicate Prevention During Recovery

**As a** developer,
**I want** recovery to use same idempotency protections as normal execution,
**so that** events are not duplicated even if system restarts multiple times during recovery.

**Acceptance Criteria:**

1. Recovery uses existing idempotency keys (no new keys generated)
2. Webhook adapter respects idempotency keys during recovery
3. Event status checked before execution (skip if already COMPLETED)
4. Optimistic locking prevents concurrent recovery attempts from processing same event
5. Unit tests verify idempotency key reuse during recovery
6. Integration tests simulate multiple restarts during recovery
7. Integration tests verify zero duplicates after 3 consecutive restarts
8. Documentation explains recovery idempotency guarantees

#### Story 3.5: Recovery on System Startup Hook

**As a** developer,
**I want** recovery to run automatically when the system starts,
**so that** no manual intervention is required after downtime.

**Acceptance Criteria:**

1. Application startup hook calls RecoveryService
2. Startup hook runs before normal scheduler starts
3. Startup hook completion logged: "Recovery check complete"
4. Startup hook handles errors gracefully (logs error, allows system to continue)
5. Startup hook skipped if no missed events found (logged: "No missed events")
6. Docker Compose restart triggers recovery automatically
7. Integration test simulates downtime and restart, verifies recovery runs
8. Recovery doesn't delay startup by more than 10 seconds

#### Story 3.6: Dead Letter Queue for Failed Events

**As a** developer,
**I want** permanently failed events sent to a Dead Letter Queue,
**so that** they can be inspected and potentially manually retried.

**Acceptance Criteria:**

1. SQS Dead Letter Queue (DLQ) configured in LocalStack
2. Main queue configured with DLQ after 3 failed processing attempts
3. DLQ receives events that fail all retries
4. DLQ message includes original event data, error details, retry count
5. Script created to inspect DLQ messages: `npm run dlq:inspect`
6. Script created to requeue DLQ messages for retry: `npm run dlq:retry`
7. Integration tests verify events reach DLQ after exhausting retries
8. Documentation added for DLQ monitoring and manual intervention

#### Story 3.7: Structured Logging with Pino

**As a** developer,
**I want** structured JSON logging using Pino throughout the application,
**so that** logs are easily parsed and analyzed in CloudWatch.

**Acceptance Criteria:**

1. Pino 8.17.2 logger configured with JSON output format
2. Log levels configured per environment: DEBUG (dev), INFO (prod)
3. All logs include context: serviceName, environment, version, correlationId
4. Scheduler logs include: eventsFound, eventsClaimed, errors
5. Executor logs include: eventId, status, executionTime, idempotencyKey, lateExecution
6. Recovery logs include: missedEventsFound, eventsRecovered, recoveryDuration
7. Error logs include full stack traces and error details
8. Integration tests verify log output format and required fields

#### Story 3.8: Metrics and Observability

**As a** developer,
**I want** key metrics logged for monitoring system health,
**so that** operational issues can be detected and diagnosed.

**Acceptance Criteria:**

1. Metrics logged for: events processed, events succeeded, events failed, processing duration
2. Metrics distinguish between on-time execution and late execution (recovery)
3. Metrics include percentiles: p50, p95, p99 for execution duration
4. Scheduler logs metrics: polling duration, events per poll, claim success rate
5. Dead Letter Queue size logged periodically
6. Test coverage metrics logged after test runs
7. Metrics formatted for easy ingestion by CloudWatch or Prometheus
8. Documentation added for interpreting metrics and setting up alerts

#### Story 3.9: Error Handling Strategy

**As a** developer,
**I want** consistent error handling across all layers,
**so that** errors are properly caught, logged, and don't crash the system.

**Acceptance Criteria:**

1. Custom error hierarchy created: DomainError, ApplicationError, InfrastructureError
2. Domain errors bubble up without modification
3. Infrastructure errors wrapped with context before re-throwing
4. HTTP adapter translates errors to appropriate status codes (400, 404, 500)
5. Lambda handlers catch all errors and log them (never throw unhandled)
6. Errors logged with correlation IDs for request tracing
7. Unit tests verify error handling in each layer
8. Integration tests verify errors don't crash the application

#### Story 3.10: Comprehensive Failure Scenario Testing

**As a** developer,
**I want** E2E tests covering all failure scenarios,
**so that** recovery and error handling are proven to work correctly.

**Acceptance Criteria:**

1. Test scenario: 24-hour downtime with 50 missed events → recovery executes all without duplicates
2. Test scenario: System restart during recovery → remaining events processed
3. Test scenario: Webhook endpoint down → events retry and eventually succeed
4. Test scenario: Webhook returns 4xx error → event marked FAILED, sent to DLQ
5. Test scenario: Database connection lost → error logged, system recovers on reconnect
6. Test scenario: Concurrent schedulers → events claimed once only (no duplicates)
7. Test scenario: Optimistic lock failure → event skipped, no retry (already claimed)
8. All failure tests pass with 100% success rate

---

### Epic 4: Testing & Production Readiness

**Epic Goal:** Build comprehensive test suite covering unit, integration, and E2E scenarios with time-mocking utilities, validate performance requirements, ensure code quality standards are met, and complete documentation for setup, deployment, and troubleshooting.

#### Story 4.1: Time-Mocking Test Utilities

**As a** developer,
**I want** utilities for mocking time in tests,
**so that** time-dependent behavior can be tested deterministically.

**Acceptance Criteria:**

1. Time-mocking utility created using Jest's fake timers
2. Utility provides methods: setCurrentTime, advanceTimeBy, advanceTimeTo
3. Utility works with Luxon DateTime objects
4. Utility resets time after each test automatically
5. Example tests demonstrate time travel for scheduler testing
6. Documentation added explaining time-mocking patterns
7. Unit tests verify time-mocking utility works correctly
8. Integration tests use time-mocking for event scheduling tests

#### Story 4.2: Timezone Edge Case Test Suite

**As a** developer,
**I want** comprehensive tests for timezone edge cases,
**so that** DST transitions and leap years are handled correctly.

**Acceptance Criteria:**

1. Tests cover DST spring forward (e.g., March 10, 2024 in America/New_York)
2. Tests cover DST fall back (e.g., November 3, 2024 in America/New_York)
3. Tests cover leap year birthdays (Feb 29 → Mar 1 in non-leap years)
4. Tests cover timezone changes during pending events (event rescheduled correctly)
5. Tests cover users in multiple timezones receiving messages at their local 9 AM simultaneously
6. Tests cover timezones with unusual offsets (e.g., Asia/Kathmandu UTC+5:45)
7. All edge case tests pass with correct timestamp calculations
8. Documentation added listing all tested edge cases

#### Story 4.3: Concurrency and Race Condition Tests

**As a** developer,
**I want** tests that simulate concurrent schedulers and race conditions,
**so that** atomic claiming and locking mechanisms are validated.

**Acceptance Criteria:**

1. Test spawns 3 concurrent scheduler instances
2. Test creates 100 PENDING events ready for execution
3. Test verifies each event claimed by exactly one scheduler (no duplicates)
4. Test verifies all 100 events eventually processed (no missed events)
5. Test uses real database (Testcontainers) for accurate concurrency behavior
6. Test measures and logs claim success rate per scheduler instance
7. Test passes with 100% exactly-once guarantee
8. Documentation explains concurrency testing approach

#### Story 4.4: Performance Validation Tests

**As a** developer,
**I want** performance tests that validate system meets NFR requirements,
**so that** throughput and latency targets are proven.

**Acceptance Criteria:**

1. Performance test creates 1000 users with birthdays
2. Test measures API response time for user CRUD operations (target: <200ms p95)
3. Test creates 100 events due simultaneously and measures processing throughput (target: 100/min)
4. Test measures scheduler precision (target: events execute within 1 minute of target time)
5. Test simulates 24-hour downtime with 100 missed events, measures recovery time (target: <5 minutes)
6. Test reports metrics: throughput, latency percentiles, error rates
7. All performance tests meet or exceed NFR targets
8. Performance test results documented in README

#### Story 4.5: Integration Test Coverage Completeness

**As a** developer,
**I want** integration tests covering all adapter implementations,
**so that** infrastructure components are proven to work correctly.

**Acceptance Criteria:**

1. Integration tests for PrismaUserRepository (all methods)
2. Integration tests for PrismaEventRepository (all methods, including FOR UPDATE SKIP LOCKED)
3. Integration tests for SQSAdapter (send message, error handling)
4. Integration tests for WebhookAdapter (success, retries, failures)
5. Integration tests for Fastify API (all endpoints with real database)
6. All integration tests use Testcontainers for PostgreSQL
7. Integration test coverage ≥100% for adapter code
8. Integration tests run successfully in CI/CD pipeline

#### Story 4.6: End-to-End Test Coverage Completeness

**As a** developer,
**I want** E2E tests covering all critical user workflows,
**so that** the complete system is validated end-to-end.

**Acceptance Criteria:**

1. E2E test: Create user → event generated → scheduler claims → worker executes → webhook delivered → status updated
2. E2E test: Update user timezone → pending events rescheduled correctly
3. E2E test: Delete user → pending events cancelled
4. E2E test: Event execution failure → retries → eventually succeeds
5. E2E test: Permanent failure → event sent to DLQ
6. E2E test: System downtime → recovery detects and executes missed events
7. E2E test: Next year event generation after current year completes
8. All E2E tests pass with 100% success rate

#### Story 4.7: Code Quality Gates Enforcement

**As a** developer,
**I want** automated code quality gates in CI/CD,
**so that** code standards are enforced before merge.

**Acceptance Criteria:**

1. CI/CD fails if test coverage <80% overall
2. CI/CD fails if critical path coverage <100% (scheduler, executor, timezone service)
3. CI/CD fails if TypeScript compilation has errors
4. CI/CD fails if ESLint has errors or >10 warnings
5. CI/CD fails if any `any` types found in production code (strict mode violation)
6. CI/CD fails if Prettier formatting violations found
7. Coverage report generated and uploaded as artifact
8. Quality gates documented in CONTRIBUTING.md

#### Story 4.8: Docker Compose Production-Like Setup

**As a** developer,
**I want** Docker Compose configuration that mimics production architecture,
**so that** local testing environment closely resembles production.

**Acceptance Criteria:**

1. Docker Compose includes: PostgreSQL, LocalStack (SQS, EventBridge), API service, Scheduler service, Worker service
2. Services communicate via Docker network (not localhost)
3. Health checks configured for all services with restart policies
4. Logs aggregated and accessible via `docker-compose logs`
5. Environment variables loaded from .env file
6. Setup script runs database migrations automatically
7. Documentation added for running full stack locally
8. `docker-compose up` starts complete working system

#### Story 4.9: API Documentation

**As a** developer,
**I want** complete API documentation with request/response examples,
**so that** external developers can integrate with the system.

**Acceptance Criteria:**

1. API documentation added to README or separate API.md file
2. Documentation includes all endpoints: POST /user, GET /user/:id, PUT /user/:id, DELETE /user/:id
3. Each endpoint documented with: HTTP method, URL, request body schema, response schema, status codes
4. Example requests shown with curl commands
5. Example responses shown with JSON payloads
6. Error responses documented with error codes and messages
7. Validation rules explained (date formats, timezone values)
8. Documentation includes quickstart guide for creating first user

#### Story 4.10: Production Deployment Guide

**As a** developer,
**I want** documentation for deploying to AWS production environment,
**so that** the system can be deployed beyond local development.

**Acceptance Criteria:**

1. Deployment guide created in DEPLOYMENT.md
2. Guide covers: AWS account setup, IAM permissions required, service configuration
3. Guide explains infrastructure components: RDS, Lambda, EventBridge, SQS, CloudWatch
4. Guide includes AWS CDK deployment instructions (optional for Phase 1)
5. Guide covers environment variable configuration
6. Guide includes monitoring and alerting setup recommendations
7. Guide includes troubleshooting common deployment issues
8. Guide notes Phase 1 constraint: local development only, production deployment is Phase 2+

---

## Checklist Results Report

_To be completed after PM checklist execution..._

---

## Next Steps

### UX Expert Prompt

_Skipped - No UI in Phase 1 MVP (API-only)_

### Architect Prompt

The architecture has already been created and sharded into focused modules. The architect should review this PRD and validate that all requirements can be implemented within the existing architectural design. Specifically:

1. Review functional requirements FR1-FR27 against existing architecture components
2. Validate that NFR performance targets are achievable with current tech stack
3. Confirm repository structure supports the epic/story breakdown
4. Identify any architectural gaps or modifications needed
5. Update architecture documentation if PRD reveals new requirements

**Handoff:** Review `docs/architecture.md` and sharded `docs/architecture/*.md` files in conjunction with this PRD to ensure alignment.

---

_This PRD was created using the BMad Method with PM Agent (John)._
_Last Updated: 2025-10-19_
