# Epic 4: Testing & Production Readiness

**Epic Goal:** Build comprehensive test suite covering unit, integration, and E2E scenarios with time-mocking utilities, validate performance requirements, ensure code quality standards are met, and complete documentation for setup, deployment, and troubleshooting.

---

## Story 4.1: Time-Mocking Test Utilities

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

## Story 4.2: Timezone Edge Case Test Suite

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

## Story 4.3: Concurrency and Race Condition Tests

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

## Story 4.4: Performance Validation Tests

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

---

## Story 4.5: Integration Test Coverage Completeness

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

## Story 4.6: End-to-End Test Coverage Completeness

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

## Story 4.7: Code Quality Gates Enforcement

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

## Story 4.8: Docker Compose Production-Like Setup

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

## Story 4.9: API Documentation

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

## Story 4.10: Production Deployment Guide

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
