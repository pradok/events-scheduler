# Project Brief: Time-Based Event Scheduling System

_Document Status: In Progress_
_Last Updated: 2025-10-18_

---

## Executive Summary

**Time-Based Event Scheduling System** is a distributed, timezone-aware event scheduling platform that triggers events at specific local times across multiple timezones. The platform starts with birthday messaging as its Phase 1 MVP while establishing the architectural foundation for any time-based event system.

**The Problem:** Organizations and applications need to execute time-sensitive actions (messages, notifications, API calls) at precise local times for users distributed globally. Existing solutions either lack timezone awareness, fail to guarantee exactly-once delivery, or cannot recover gracefully from system downtime without sending duplicates or missing events.

**The Solution:** A robust event scheduling system built on AWS serverless architecture that combines timezone-aware scheduling with exactly-once delivery guarantees and automatic failure recovery. Phase 1 delivers birthday messaging; the extensible architecture supports anniversaries, reminders, subscriptions, and any time-based event.

**Target Market:** Development teams building applications requiring time-based user engagement (SaaS platforms, consumer apps, notification systems) and organizations needing reliable timezone-aware scheduling without building complex infrastructure.

**Key Value Proposition:** "Set it and forget it" reliability - developers define events with local times, and the system handles timezone conversions, DST transitions, exactly-once delivery, and automatic recovery from failures.

---

## Problem Statement

### Current State and Pain Points

Modern applications serve globally distributed users who expect personalized, timely interactions in their local context. However, implementing reliable time-based event scheduling presents three critical challenges that existing solutions fail to address adequately:

**1. Timezone Complexity**
- Applications must trigger events at specific local times (e.g., "9:00 AM") across dozens of timezones
- Daylight Saving Time transitions occur on different dates in different regions
- Users may change timezones (travel, relocation) requiring schedule recalculation
- Converting between local time and UTC for storage/querying is error-prone without deep timezone expertise

**2. Exactly-Once Delivery Guarantee**
- Race conditions in distributed systems can cause duplicate message delivery
- Multiple scheduler instances may claim the same event simultaneously
- Retry logic after failures risks re-executing already-successful operations
- Clock skew between servers creates overlapping execution windows

**3. Failure Recovery Without Side Effects**
- When systems experience downtime, they must "catch up" on missed events
- Naive catch-up approaches either miss events entirely or send duplicates
- Distinguishing between "never sent" and "sent but status update failed" is difficult
- Manual intervention for recovery is unacceptable for production systems

### Impact of the Problem

**For Development Teams:**
- 40+ hours invested researching timezone libraries and DST edge cases
- Complex state machine logic required to prevent race conditions
- Extensive testing needed for time-based scenarios (leap years, DST transitions, etc.)
- Production incidents from missed or duplicate notifications damage user trust

**For End Users:**
- Receiving duplicate notifications frustrates users and degrades experience
- Missing important time-sensitive messages (renewals, reminders) causes real-world impact
- Messages arriving at wrong local times feel impersonal and poorly executed

### Why Existing Solutions Fall Short

**Cron-based Schedulers (AWS EventBridge Scheduled Rules, Kubernetes CronJobs):**
- No native timezone awareness (runs on UTC only)
- Requires manual timezone conversion and DST handling in application code
- No built-in exactly-once execution guarantees
- Difficult to handle user-specific schedules at scale

**Database TTL Mechanisms (DynamoDB TTL, Redis EXPIRE):**
- Imprecise timing (DynamoDB TTL: up to 48 hours variance)
- No "execute on expiry" hooks - requires polling
- Cannot guarantee exactly-once execution
- Limited control over execution order and priority

**DIY Polling Solutions:**
- Teams reinvent the same complex patterns repeatedly
- Testing time-based logic is difficult and often incomplete
- Edge cases (DST, leap years, concurrent updates) are discovered in production
- Maintenance burden grows as feature complexity increases

### Urgency and Importance

**Market Timing:** User expectations for personalized, timely engagement continue to rise. Applications without reliable time-based communication fall behind competitors who deliver seamless, timezone-aware experiences.

**Technical Debt:** Teams currently build fragile, custom solutions that accumulate technical debt. A robust, reusable platform prevents this proliferation while enabling rapid feature development.

**Scalability:** As applications grow globally, timezone complexity compounds. Solving this problem once, correctly, with a proven architecture is far more efficient than each team tackling it independently.

---

## Proposed Solution

### Core Concept and Approach

The Time-Based Event Scheduling System solves timezone-aware event triggering through a **five-layer architecture** that separates concerns and enables extensibility:

1. **Event Registry Layer** - Define event types with their scheduling rules and handlers
2. **Event Materialization Layer** - Generate concrete event instances from entity data (e.g., user birthdays)
3. **Event Scheduler Layer** - Continuously evaluate "is it time?" and claim ready events atomically
4. **Event Executor Layer** - Execute event actions with retry logic and idempotency guarantees
5. **Recovery & Monitoring Layer** - Detect failures, catch up on missed events, provide observability

### High-Level Architecture

```
EventBridge (1 min trigger) → Lambda Scheduler → RDS PostgreSQL + SQS → Lambda Worker → Webhook/SNS/SES
```

**Flow:**
1. **EventBridge** triggers scheduler Lambda every minute
2. **Scheduler Lambda** queries PostgreSQL for events where `targetTimestampUTC <= NOW()` and `status = PENDING`
3. Events are claimed atomically using `FOR UPDATE SKIP LOCKED` (prevents race conditions)
4. Event details sent to **SQS queue** for asynchronous processing
5. **Worker Lambda** consumes from SQS, executes webhook/SMS/email delivery
6. Event status updated to `COMPLETED` or `FAILED` with retry logic

### Key Differentiators

**1. Timezone Intelligence Built-In**
- Uses Luxon library with IANA timezone database for accurate conversions
- Handles DST transitions automatically (spring forward/fall back)
- Stores events in UTC but calculates triggers based on local time
- Example: User in New York (9:00 AM EST = 14:00 UTC) vs Tokyo (9:00 AM JST = 00:00 UTC) both get messages at their 9 AM

**2. Exactly-Once Delivery Guarantee**
- **Optimistic Locking**: Version numbers on events prevent concurrent updates
- **State Machine**: Enforces valid transitions (PENDING → PROCESSING → COMPLETED)
- **Atomic Claiming**: PostgreSQL `FOR UPDATE SKIP LOCKED` ensures only one scheduler claims each event
- **Idempotency Keys**: External API calls tracked to prevent duplicate webhook/SMS/email sends

**3. Automatic Failure Recovery**
- On system startup, query for events where `targetTimestampUTC < NOW()` and `status = PENDING`
- Execute missed events with "late execution" flag in logs
- Dead Letter Queue captures permanently failed events after retry exhaustion
- No manual intervention required for common failure scenarios

**4. Extensible Event Type System**
- Strategy pattern for event handlers (Birthday, Anniversary, Reminder, Custom)
- Event types defined via configuration, not hardcoded logic
- Phase 1: Birthday handler only
- Future phases: Plug in new handlers without modifying core scheduler

**5. Production-Ready Infrastructure**
- AWS serverless architecture scales automatically
- SQS queue buffers bursts (100+ events/minute)
- RDS PostgreSQL provides ACID guarantees and complex queries
- CloudWatch logs + metrics for full observability

### Why This Solution Will Succeed

**Proven Patterns:**
- Polling with optimistic locking is a battle-tested approach for distributed job scheduling
- PostgreSQL's advanced locking features solve race conditions elegantly
- AWS serverless architecture eliminates infrastructure management

**Clear Separation of Concerns:**
- Scheduling logic is completely independent of execution logic
- Event handlers are pluggable and testable in isolation
- Timezone conversion isolated in dedicated service layer

**Developer-First Experience:**
- Simple API: Create user with birthday → system handles the rest
- No timezone math required in application code
- Extensibility through configuration, not code changes

**Comprehensive Testing Strategy:**
- Unit tests for domain logic and timezone conversions
- Integration tests with real PostgreSQL database
- End-to-end tests for recovery scenarios and race conditions
- Time-mocking utilities for deterministic time-based tests

### High-Level Product Vision

**Phase 1 (MVP):** Birthday messaging system with webhook delivery, proving the architecture with a concrete, well-understood use case.

**Phase 2+:** Event platform supporting multiple event types (anniversaries, reminders, subscriptions), multiple delivery channels (SMS, Email, Push), and advanced features (custom schedules, event dependencies, user dashboards).

**Long-term Vision:** The "Stripe for time-based events" - developers integrate via simple API, and all timezone complexity, reliability guarantees, and infrastructure management is handled by the platform.

---

## Goals & Success Metrics

### Business Objectives

- **Prove Technical Viability:** Successfully implement Phase 1 MVP demonstrating timezone-aware scheduling, exactly-once delivery, and failure recovery for birthday messaging use case (Timeline: 4 weeks)

- **Achieve Architectural Validation:** Validate five-layer architecture extensibility by documenting clear path to add second event type (anniversary) without modifying core scheduler logic (Success: Design document completed by end of Phase 1)

- **Establish Development Velocity Baseline:** Measure time-to-implement for birthday feature to project ROI for future event types (Target: <40 engineering hours for next event type vs. baseline development time)

- **Build Reusable Infrastructure Foundation:** Create modular, well-tested components (timezone service, scheduler, executor) that serve as building blocks for future phases (Success: 80%+ code coverage, clean separation of concerns validated in code review)

### User Success Metrics

> **Note:** For Phase 1 MVP, "users" are test users in the system, not external customers

- **Timezone Accuracy:** 100% of birthday messages delivered at correct local time (9:00 AM ±5 minutes in user's timezone)

- **Delivery Reliability:** 100% of scheduled birthday events execute successfully (no missed birthdays for active users)

- **Zero Duplicate Messages:** 0 duplicate birthday messages sent under any failure scenario (system downtime, concurrent schedulers, retry logic)

- **Recovery Effectiveness:** 100% of missed events recovered and executed after 24-hour simulated downtime without duplicates

- **API Response Performance:** <200ms response time for user CRUD operations (create, read, update, delete) at 95th percentile

### Key Performance Indicators (KPIs)

- **Event Processing Throughput:** System handles 100+ birthday events per minute without failures or delays (Target: Tested and validated with synthetic load)

- **Scheduler Precision:** Events execute within 1 minute of target time under normal conditions (Measured: `execution_timestamp - target_timestamp`)

- **Failure Recovery Time:** System catches up on 100 missed events within 5 minutes of restart (Measured: Time from startup to last event execution)

- **Code Quality Metrics:**
  - Test Coverage: ≥80% overall, 100% for critical paths (scheduler, executor, timezone service)
  - TypeScript Strict Mode: 100% compliance, zero `any` types in production code
  - Linting Violations: 0 errors, <10 warnings

- **Operational Metrics:**
  - Event Success Rate: ≥99% of events transition to COMPLETED status
  - Dead Letter Queue Size: <1% of total events (indicates permanent failures)
  - Retry Rate: Average <2 retries per event

---

## MVP Scope

### Core Features (Must Have)

- **User Management API:** RESTful endpoints for user lifecycle management
  - `POST /user` - Create user with firstName, lastName, dateOfBirth (YYYY-MM-DD), timezone (IANA format)
  - `GET /user/:id` - Retrieve user details
  - `PUT /user/:id` - Update user details (including birthday/timezone changes)
  - `DELETE /user/:id` - Delete user and associated events
  - Validation: Valid date formats, valid IANA timezones, required fields

- **Automatic Birthday Event Generation:** System-managed event lifecycle
  - Create birthday event automatically when user is created
  - Calculate target time: 9:00 AM in user's local timezone converted to UTC
  - Generate next year's birthday event when current year executes
  - Update/cancel events when user birthday or timezone changes (PUT endpoint)

- **Timezone-Aware Scheduling:** Precise local time execution
  - Store all timestamps in UTC for database consistency
  - Convert local time (9:00 AM) to UTC using Luxon with IANA timezone database
  - Handle Daylight Saving Time transitions automatically
  - Support all major timezones (tested with New York, London, Tokyo, Sydney)

- **Event Scheduler (Background Process):** Periodic event evaluation
  - Run every 1 minute via EventBridge trigger
  - Query: `SELECT * FROM events WHERE targetTimestampUTC <= NOW() AND status = 'PENDING' FOR UPDATE SKIP LOCKED`
  - Atomic event claiming prevents race conditions between scheduler instances
  - Send event details to SQS queue for asynchronous processing

- **Event Executor (Worker Lambda):** Reliable event execution
  - Consume events from SQS queue
  - Execute webhook POST to RequestBin (or similar service)
  - Message format: `{"message": "Hey, {firstName} {lastName} it's your birthday"}`
  - Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
  - Update event status: `PENDING → PROCESSING → COMPLETED` or `FAILED`

- **Exactly-Once Delivery Guarantee:** No duplicate messages
  - Optimistic locking with version numbers on events
  - State machine enforcement (only valid transitions allowed)
  - Idempotency keys for external webhook calls
  - Database transactions ensure atomic status updates

- **Failure Recovery Mechanism:** Automatic catch-up after downtime
  - On system startup, query for events where `targetTimestampUTC < NOW()` AND `status = 'PENDING'`
  - Execute all missed events with "late execution" flag in logs
  - Dead Letter Queue for events failing after max retries
  - No manual intervention required for recovery

### Out of Scope for MVP

- **Additional Event Types:** Anniversary messages, custom reminders, subscription renewals (deferred to Phase 2)
- **Multiple Delivery Channels:** SMS via SNS, Email via SES (Phase 1 webhook only, architecture supports future expansion)
- **Custom Trigger Times:** User-specified time preferences (hardcoded to 9:00 AM for MVP)
- **Authentication/Authorization:** API keys, user authentication (local development only for Phase 1)
- **User Dashboard:** Web UI for managing users and viewing event history
- **Advanced Scheduling:** Event dependencies, conditional execution, priority queues
- **Multi-Tenancy:** Separate data per organization (single-tenant for MVP)
- **Production Monitoring:** Prometheus, Grafana, alerting (CloudWatch logs only for Phase 1)
- **Rate Limiting:** API throttling and abuse prevention
- **Leap Year Special Handling:** Feb 29 birthdays send on Mar 1 in non-leap years (documented behavior, not configurable)

### MVP Success Criteria

**Functional Requirements Met:**

- ✅ Create, read, update, delete users via API
- ✅ Birthday message sent at exactly 9:00 AM local time for each timezone
- ✅ Multiple users in different timezones receive messages at their correct local times simultaneously
- ✅ System recovers from 24-hour downtime and sends all missed messages without duplicates
- ✅ Zero duplicate messages under any scenario (concurrent schedulers, retries, downtime recovery)
- ✅ User can update birthday/timezone and next message sends on correct day/time

**Technical Requirements Met:**

- ✅ 80%+ test coverage (unit + integration + end-to-end tests)
- ✅ All tests passing in CI/CD pipeline
- ✅ TypeScript strict mode with zero `any` types
- ✅ Runs successfully on LocalStack for local development
- ✅ Docker Compose setup works end-to-end
- ✅ Handles 1000 users and 100+ same-day birthdays without issues

**Documentation Complete:**

- ✅ README with setup instructions
- ✅ API documentation (request/response examples)
- ✅ Architecture diagrams and design documentation
- ✅ Developer guide for local setup
- ✅ Testing guide with examples

---

## Post-MVP Vision

### Phase 2 Features (Next Priority)

**Event Type Extensibility**

- Add Anniversary event type as second use case
- Implement event type registry pattern (pluggable handlers)
- Support custom message templates per event type
- Validate extensibility architecture with minimal code changes

**Multi-Channel Delivery**

- SMS delivery via AWS SNS (US phone numbers initially)
- Email delivery via AWS SES (transactional emails)
- Multi-channel strategy per event (webhook + email, SMS fallback, etc.)
- Channel-specific retry and failure handling

**Enhanced User Preferences**

- Custom trigger time per user (not hardcoded 9:00 AM)
- Delivery channel preferences (webhook, SMS, email, or combination)
- Timezone update handling with event rescheduling
- Opt-out/pause functionality for specific event types

**Observability and Operations**

- Event execution dashboard (simple web UI)
- Failed event inspection and manual retry interface
- Metrics dashboard (delivery rates, latency, failures)
- Enhanced logging with correlation IDs and structured fields

### Long-Term Vision (12-24 Months)

Transform into a full-featured event scheduling platform with:

- Multi-tenancy and enterprise features (API authentication, rate limiting, RBAC)
- Advanced event capabilities (custom recurrence rules, event dependencies, conditional execution)
- Developer ecosystem (client libraries, integrations, API marketplace)
- Industry-specific solutions and compliance certifications (HIPAA, SOC 2, GDPR)

### Expansion Opportunities

- **Horizontal:** Support non-user entities (contracts, subscriptions), integration marketplace (Zapier, n8n)
- **Vertical:** Industry-specific solutions (healthcare, fintech) with compliance requirements
- **Technology:** Real-time event streaming, mobile SDKs, self-hosted deployment options

---

## Technical Considerations

### Platform Requirements

- **Target Platforms:** Cloud-native serverless (AWS Lambda primary, architecture supports other cloud providers)
- **Browser/OS Support:** N/A for Phase 1 (API-only, no frontend)
- **Performance Requirements:**
  - API latency: <200ms (95th percentile for CRUD operations)
  - Event processing: 100+ events per minute throughput
  - Scheduler precision: Events execute within 1 minute of target time
  - System capacity: Tested with 1000+ users, 100+ concurrent same-day events

### Technology Stack

**Frontend:**

- Phase 1: None (API-only)
- Future: React/Next.js for admin dashboard and event inspection UI

**Backend:**

- Runtime: Node.js 18+ with TypeScript (strict mode)
- Framework: Express.js for REST API
- ORM: Prisma for type-safe database access
- Date/Time: Luxon for timezone handling with IANA database
- Testing: Jest for unit, integration, and E2E tests

**Database:**

- Phase 1: PostgreSQL 16 (RDS or Docker for local development)
- Rationale: ACID transactions, `FOR UPDATE SKIP LOCKED` for atomic event claiming, rich query capabilities
- Future consideration: Read replicas for scaling query load

**Hosting/Infrastructure:**

- Development: Docker Compose + LocalStack for local AWS simulation
- Production (future): AWS serverless stack (Lambda, EventBridge, SQS, RDS, SNS, SES)
- IaC: Terraform or AWS CDK for infrastructure management (Phase 2+)

### Architecture Considerations

#### Architecture Pattern: Domain-Driven Design + Hexagonal Architecture

The codebase follows **Hexagonal Architecture (Ports and Adapters)** with **Domain-Driven Design** principles to ensure:

- **Process Portability:** Core business logic independent of deployment model (Lambda, Container, Node process)
- **Infrastructure Independence:** Domain layer has zero dependencies on frameworks, databases, or external services
- **Testability:** Business logic testable without infrastructure (no database, no HTTP server required)
- **Maintainability:** Clear boundaries between domain logic and technical concerns

#### Hexagonal Architecture Layers

```text
┌─────────────────────────────────────────────────────┐
│                   Adapters (Primary)                │
│    HTTP API │ Lambda Handler │ CLI │ Scheduler      │ ← Entry points
├─────────────────────────────────────────────────────┤
│                   Application Layer                 │
│         Use Cases │ Commands │ Queries              │ ← Orchestration
├─────────────────────────────────────────────────────┤
│                    Domain Layer                     │
│   Entities │ Value Objects │ Domain Services        │ ← Business logic
│              (PURE - No dependencies)               │
├─────────────────────────────────────────────────────┤
│                 Ports (Interfaces)                  │
│  IUserRepository │ IEventRepository │ IMessageSender│ ← Contracts
├─────────────────────────────────────────────────────┤
│                Adapters (Secondary)                 │
│  Prisma │ Webhook Client │ SQS │ SNS │ SES         │ ← Implementations
└─────────────────────────────────────────────────────┘
```

#### Repository Structure (DDD + Hexagonal)

```text
bday/
├── src/
│   ├── adapters/              # Infrastructure adapters
│   │   ├── primary/           # Inbound adapters (entry points)
│   │   │   ├── http/          # Express API routes & controllers
│   │   │   ├── lambda/        # AWS Lambda handlers
│   │   │   └── cli/           # CLI commands (optional)
│   │   └── secondary/         # Outbound adapters (infrastructure)
│   │       ├── persistence/   # Database implementations (Prisma)
│   │       ├── messaging/     # SQS, SNS, SES clients
│   │       └── delivery/      # Webhook, SMS, Email senders
│   │
│   ├── application/           # Application layer (use cases)
│   │   ├── use-cases/         # Business workflows
│   │   │   ├── CreateUser.ts
│   │   │   ├── ScheduleEvent.ts
│   │   │   └── ExecuteEvent.ts
│   │   └── ports/             # Interface definitions (contracts)
│   │       ├── IUserRepository.ts
│   │       ├── IEventRepository.ts
│   │       └── IMessageSender.ts
│   │
│   ├── domain/                # Domain layer (PURE business logic)
│   │   ├── entities/          # Domain entities
│   │   │   ├── User.ts
│   │   │   └── Event.ts
│   │   ├── value-objects/     # Immutable value objects
│   │   │   ├── Timezone.ts
│   │   │   ├── EventStatus.ts
│   │   │   └── DateOfBirth.ts
│   │   ├── services/          # Domain services
│   │   │   ├── TimezoneService.ts
│   │   │   └── EventScheduler.ts
│   │   └── events/            # Domain events (optional)
│   │
│   └── shared/                # Shared kernel
│       ├── types/             # Common types
│       ├── errors/            # Custom error classes
│       └── utils/             # Pure utility functions
│
├── tests/                     # Tests mirror src/ structure
│   ├── unit/                  # Domain & application layer tests
│   ├── integration/           # Adapter integration tests
│   └── e2e/                   # End-to-end scenarios
│
├── prisma/                    # Database schema and migrations
├── docker/                    # Container configurations
└── infrastructure/            # IaC (Terraform/CDK) - Phase 2+
```

#### Service Architecture

- **Deployment Portability:** Same codebase runs as:
  - **Lambda Functions:** Scheduler (EventBridge → Lambda), Worker (SQS → Lambda)
  - **Container:** Full application with API + background scheduler
  - **Node Process:** Local development with nodemon

- **Adapter Swapping:** Change deployment model by swapping primary adapters only
  - Lambda handler wraps use cases
  - Express routes wrap same use cases
  - Domain logic unchanged regardless of deployment

- **Dependency Injection:** Use cases receive port implementations at runtime
  - Production: Prisma repository, AWS SQS client
  - Testing: In-memory repository, mock message sender
  - Local dev: Docker PostgreSQL, RequestBin webhook

#### Integration Requirements

- Webhook delivery (HTTP POST to external endpoints)
- Future: AWS SNS for SMS, AWS SES for email
- Future: Integration with observability platforms (DataDog, New Relic)

#### Security/Compliance

- Phase 1: Local development only, no production security requirements
- Phase 2+: API authentication (JWT), webhook signature verification, PII encryption at rest
- Future: SOC 2, GDPR compliance for enterprise adoption

---

## Constraints & Assumptions

### Constraints

**Budget:**

- Phase 1: Learning/portfolio project with no budget constraint for development time
- AWS costs: Target <$50/month for LocalStack development environment
- Phase 2+: Production AWS costs to be evaluated based on usage patterns

**Timeline:**

- Phase 1 MVP: 4-week implementation plan
  1. Foundation (setup, database, basic API)
  2. Core scheduling (events, timezone logic, scheduler)
  3. Reliability (exactly-once, retries, recovery)
  4. Polish (testing, documentation, performance validation)

**Resources:**

- Solo developer project for Phase 1
- No external dependencies or third-party teams
- Limited to personal development time (evenings/weekends or dedicated project time)

**Technical:**

- Must run locally on Docker/LocalStack (no production AWS required for Phase 1)
- PostgreSQL database (no NoSQL for MVP given atomic locking requirements)
- Node.js ecosystem (leveraging existing JavaScript/TypeScript expertise)
- English-only messages and documentation for Phase 1

### Key Assumptions

**Technical Assumptions:**

- PostgreSQL `FOR UPDATE SKIP LOCKED` adequately prevents race conditions for MVP scale
- 1-minute scheduler interval provides acceptable precision for birthday messaging
- Luxon library correctly handles all timezone and DST edge cases
- LocalStack sufficiently simulates AWS services for development/testing
- Single scheduler instance sufficient for Phase 1 (horizontal scaling validated in architecture, not implementation)

**Product Assumptions:**

- Birthday messaging is compelling enough use case to validate architecture
- Hardcoded 9:00 AM trigger time is acceptable for MVP (user preferences deferred to Phase 2)
- Webhook delivery is sufficient for Phase 1 (SMS/Email deferred)
- Developers (target users) comfortable with REST API integration
- Event extensibility architecture will generalize to other event types beyond birthdays

**Business Assumptions:**

- Learning and portfolio demonstration are primary Phase 1 goals
- No immediate revenue or customer acquisition targets
- Open-source or internal project (licensing TBD)
- Future phases contingent on Phase 1 success and validation

**Operational Assumptions:**

- 24-hour maximum downtime acceptable for recovery testing
- Manual database schema migrations acceptable for Phase 1
- CloudWatch logs sufficient for observability (no APM required initially)
- English-language error messages and logging acceptable

---

## Risks & Open Questions

### Key Risks

- **Timezone Library Limitations:** Luxon may have edge cases or bugs in DST handling or obscure timezones. _Impact: Incorrect message delivery times._ _Mitigation: Extensive test coverage for timezone scenarios, timezone service abstraction allows library swap if needed._

- **LocalStack Divergence from AWS:** LocalStack behavior may differ from real AWS services, causing production issues. _Impact: Architecture validated locally but fails in production._ _Mitigation: Document LocalStack-specific quirks, plan for real AWS validation testing in Phase 2._

- **Race Condition Discovery:** `FOR UPDATE SKIP LOCKED` may have unexpected behavior under high concurrency. _Impact: Duplicate message delivery._ _Mitigation: Comprehensive concurrency testing, optimistic locking as secondary safeguard._

- **Scope Creep:** Adding features beyond MVP scope extends timeline and delays learning. _Impact: Project never reaches "done" state._ _Mitigation: Strict adherence to MVP scope document, defer all Phase 2 features._

- **Leap Year Edge Case:** Feb 29 birthdays may cause unexpected behavior in non-leap years. _Impact: User confusion or missed birthdays._ _Mitigation: Document behavior (send on Mar 1), add explicit test cases, consider making configurable in Phase 2._

### Open Questions

- **Deployment Target:** Will this ever be deployed to production AWS, or remain a local development project?
- **Webhook Endpoint:** What webhook testing service should be recommended (RequestBin, Webhook.site, Beeceptor)?
- **Error Notification:** How should permanently failed events be surfaced (logs only, or future admin UI)?
- **Database Migrations:** Use Prisma Migrate for schema changes, or manual SQL migration scripts?
- **Event History:** Should executed events be retained indefinitely, or archived/deleted after N days?
- **Scheduler Process:** Run as separate Node process, Lambda function, or integrated with API server?
- **CI/CD Pipeline:** GitHub Actions, GitLab CI, or local testing only for Phase 1?

### Areas Needing Further Research

- **Time-Mocking Strategy:** Best practices for testing time-dependent code with Jest (manual mocking vs. libraries like `timekeeper` or `MockDate`)
- **Concurrency Testing:** Tools and techniques for simulating concurrent scheduler instances in local environment
- **PostgreSQL Performance:** Index optimization strategies for time-based queries at scale (>10K users, >100K events)
- **LocalStack Limitations:** Known issues with EventBridge, SQS, or Lambda in LocalStack that could affect development
- **Production Monitoring:** What observability strategy for Phase 2+ (DataDog, New Relic, self-hosted Prometheus/Grafana)?

---

## Appendices

### A. Research Summary

This project brief is built on comprehensive Phase 0 planning and research documented in `docs-initial/`:

**Problem Analysis:**

- 8 major technical challenges identified and analyzed ([challenges.md](../docs-initial/challenges.md))
- Abstract problem statement defining this as a distributed event system ([problem-statement.md](../docs-initial/problem-statement.md))

**Architecture & Design:**

- Five-layer architecture with AWS serverless infrastructure ([architecture/](../docs-initial/architecture/))
- Complete system design with component architecture and data flows
- Message delivery design for multi-channel support (Webhook/SMS/Email)
- Local development setup guide with Docker and LocalStack

**Technology Choices:**

- PostgreSQL vs DynamoDB analysis with ORM comparison ([database-selection.md](../docs-initial/tech-choices/database-selection.md))
- Event triggering mechanism comparison: Polling vs EventBridge vs DynamoDB TTL ([event-triggering-mechanism.md](../docs-initial/tech-choices/event-triggering-mechanism.md))
- Date/time library analysis: Luxon vs date-fns vs Day.js ([datetime-library.md](../docs-initial/tech-choices/datetime-library.md))

**Implementation Planning:**

- Detailed 4-week Phase 1 MVP scope ([phase1-mvp-scope.md](../docs-initial/phase1-mvp-scope.md))
- Requirements-solutions mapping for all brief requirements
- Documentation roadmap identifying gaps and priorities

### B. References

**Project Documentation:**

- Original Brief: `docs-initial/brief.md`
- Architecture Overview: `docs-initial/architecture/README.md`
- Phase 1 MVP Scope: `docs-initial/phase1-mvp-scope.md`
- Technology Choices: `docs-initial/tech-choices/README.md`

**External Resources:**

- IANA Timezone Database: <https://www.iana.org/time-zones>
- Luxon Documentation: <https://moment.github.io/luxon/>
- PostgreSQL Locking: <https://www.postgresql.org/docs/current/explicit-locking.html>
- AWS Serverless Best Practices: <https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html>

---

## Next Steps

### Immediate Actions

1. **Review and finalize this Project Brief** - Validate assumptions, answer open questions, confirm scope alignment
2. **Set up development environment** - Install Node.js, Docker, PostgreSQL, and configure LocalStack
3. **Initialize project repository** - Create Git repo, set up Hexagonal Architecture structure, configure TypeScript and ESLint
4. **Create database schema** - Design and implement User and Event tables using Prisma
5. **Begin Phase 1: Foundation** - Implement domain entities, value objects, and basic use cases following DDD + Hexagonal patterns

### Handoff to Development

This Project Brief provides the complete context for the **Time-Based Event Scheduling System**.

**For Phase 1 Implementation:**

- Follow the 4-step implementation plan outlined in Constraints section
- Reference detailed technical specifications in `docs-initial/` folder
- Adhere strictly to **Hexagonal Architecture + DDD** principles for code portability
- Implement domain layer first (pure business logic with zero dependencies)
- Build adapters (HTTP, Lambda, Prisma) that wrap use cases
- Validate Success Criteria before marking Phase 1 complete

**For Architecture Decisions:**

- Consult `docs-initial/tech-choices/` for technology selection rationale
- Review `docs-initial/architecture/` for system design details
- Follow five-layer architecture pattern: Registry → Materialization → Scheduler → Executor → Recovery
- Ensure **deployment portability**: code runs identically in Lambda, Container, or Node process

**For Questions During Implementation:**

- Check Open Questions section for known decision points
- Review Risks section for mitigation strategies
- Consult External Resources in Appendices for technical deep-dives

**Key Architectural Principles:**

- **Domain layer is PURE** - No framework dependencies, fully testable without infrastructure
- **Use cases orchestrate** - Application layer coordinates domain entities and ports
- **Adapters are swappable** - Change deployment model or infrastructure without touching domain
- **Ports define contracts** - Interfaces between layers enable dependency inversion

---

**Ready to build with clean architecture!** 🚀

---

_Document Status: Complete_
_Last Updated: 2025-10-18_
_Version: 1.0_

