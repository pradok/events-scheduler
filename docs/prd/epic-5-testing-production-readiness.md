# Epic 5: Testing & Production Readiness

**Epic Goal:** Build comprehensive test suite covering unit, integration, and E2E scenarios with time-mocking utilities, validate performance requirements, ensure code quality standards are met, and complete documentation for setup, deployment, and troubleshooting.

---

## Story 5.1: Time-Mocking Test Utilities

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

---

## Story 5.2: Timezone Edge Case Test Suite

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

---

## Story 5.3: Concurrency and Race Condition Tests

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

---

## Story 5.4: Performance Validation Tests

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
7. Performance test results documented in README with actual metrics vs. targets

**Performance Validation & Contingency Planning:**

8. If performance tests meet or exceed all NFR targets:
   - Document actual performance metrics in README (e.g., "API p95: 145ms")
   - Mark Story 4.4 as complete
   - Proceed to MVP release

9. If performance tests fail to meet NFR targets:
   - Document actual vs. target metrics in performance test results
   - Analyze bottlenecks and identify root causes (database queries, serialization, network, etc.)
   - Create performance optimization tasks in backlog with severity labels:
     - CRITICAL: >50% variance from target (e.g., 300ms vs. 200ms target)
     - HIGH: 25-50% variance from target
     - MEDIUM: 10-25% variance from target
   - If all variances are MEDIUM or lower: Accept for MVP, defer optimization to Phase 2
   - If any variances are HIGH or CRITICAL: Product Owner decides go/no-go for MVP release

10. Performance optimization backlog items must include:
    - Current metric vs. target metric with percentage variance
    - Identified bottleneck (database, network, computation, serialization, etc.)
    - Proposed optimization approach (indexing, caching, query optimization, etc.)
    - Estimated effort (hours/days) and implementation risk level (low/medium/high)

---

## Story 5.5: Integration Test Coverage Completeness

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

---

## Story 5.6: End-to-End Test Coverage Completeness

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

---

## Story 5.7: Code Quality Gates Enforcement

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

---

## Story 5.8: Docker Compose Production-Like Setup

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

---

## Story 5.9: API Documentation

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

---

## Story 5.10: Production Deployment Guide

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

**Fastify Lambda Deployment Configuration:**

9. Deployment guide includes Fastify AWS Lambda adapter setup:
   - Installation instructions: `npm install @fastify/aws-lambda`
   - Lambda handler wrapper example using `@fastify/aws-lambda`
   - Code example showing how to wrap Fastify app for Lambda deployment
   - Environment-specific configuration (local Fastify server vs. Lambda)
   - Reference to AWS Lambda function handler configuration (runtime, timeout, memory)
   - Performance considerations for Lambda cold starts with Fastify

---

## Story 5.11: Recovery Late Execution Flag & Metrics

**As a** developer,
**I want** missed events executed with a "late execution" flag in logs,
**so that** recovery operations are distinguishable from normal execution.

**Note:** *Deferred from Epic 3 - useful for observability but not required for basic recovery functionality*

**Acceptance Criteria:**

1. Extend SQSMessagePayload schema with `lateExecution: boolean` field
2. RecoveryService sends missed events to SQS with metadata flag `lateExecution: true`
3. ExecuteEventUseCase checks for late execution flag
4. Late execution logged with additional context: how late, original target time, actual execution time
5. Late execution metrics tracked separately from on-time execution
6. Recovery service logs progress: "Recovering 50 missed events..."
7. Unit tests verify late execution flag propagates correctly
8. Integration tests verify late execution logging appears in output

**Implementation Notes:**

- Builds on Story 3.2 (basic recovery execution)
- Adds observability layer without changing core recovery flow
- Enables CloudWatch queries to distinguish recovery vs normal execution
- Useful for SLA monitoring and operational dashboards

---

## Story 5.12: Dead Letter Queue for Failed Events

**As a** developer,
**I want** permanently failed events sent to a Dead Letter Queue,
**so that** they can be inspected and potentially manually retried.

**Note:** *Deferred from Epic 3 - operational tooling not required for MVP*

**Acceptance Criteria:**

1. SQS Dead Letter Queue (DLQ) configured in LocalStack
2. Main queue configured with DLQ after 3 failed processing attempts
3. DLQ receives events that fail all retries
4. DLQ message includes original event data, error details, retry count
5. Script created to inspect DLQ messages: `npm run dlq:inspect`
6. Script created to requeue DLQ messages for retry: `npm run dlq:retry`
7. Integration tests verify events reach DLQ after exhausting retries
8. Documentation added for DLQ monitoring and manual intervention

---

## Story 5.13: Enhanced Metrics and Observability

**As a** developer,
**I want** key metrics logged for monitoring system health,
**so that** operational issues can be detected and diagnosed.

**Note:** *Deferred from Epic 3 - premature optimization, add after production usage data available*

**Acceptance Criteria:**

1. Metrics logged for: events processed, events succeeded, events failed, processing duration
2. Metrics distinguish between on-time execution and late execution (recovery)
3. Metrics include percentiles: p50, p95, p99 for execution duration
4. Scheduler logs metrics: polling duration, events per poll, claim success rate
5. Dead Letter Queue size logged periodically
6. Test coverage metrics logged after test runs
7. Metrics formatted for easy ingestion by CloudWatch or Prometheus
8. Documentation added for interpreting metrics and setting up alerts

---

## Story 5.14: Comprehensive Failure Scenario Testing

**As a** developer,
**I want** E2E tests covering all failure scenarios,
**so that** recovery and error handling are proven to work correctly.

**Note:** *Deferred from Epic 3 - valuable tests but not MVP blockers*

**Acceptance Criteria:**

1. Test scenario: 24-hour downtime with 50 missed events → recovery executes all without duplicates
2. Test scenario: System restart during recovery → remaining events processed
3. Test scenario: Webhook endpoint down → events retry and eventually succeed
4. Test scenario: Webhook returns 4xx error → event marked FAILED, sent to DLQ
5. Test scenario: Database connection lost → error logged, system recovers on reconnect
6. Test scenario: Concurrent schedulers → events claimed once only (no duplicates)
7. Test scenario: Optimistic lock failure → event skipped, no retry (already claimed)
8. All failure tests pass with 100% success rate
