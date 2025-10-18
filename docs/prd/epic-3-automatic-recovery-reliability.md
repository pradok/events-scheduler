# Epic 3: Automatic Recovery & Reliability

**Epic Goal:** Implement the self-healing recovery mechanism that automatically detects and executes missed events after system downtime, comprehensive failure handling with Dead Letter Queue, and complete observability through structured logging and metrics. This epic delivers the critical "automatic recovery" differentiator.

---

## Story 3.1: Recovery Service - Missed Event Detection

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

---

## Story 3.2: Recovery Execution with Late Flag

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

---

## Story 3.3: Recovery Performance Optimization

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

---

## Story 3.4: Duplicate Prevention During Recovery

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

---

## Story 3.5: Recovery on System Startup Hook

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

---

## Story 3.6: Dead Letter Queue for Failed Events

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

---

## Story 3.7: Structured Logging with Pino

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

---

## Story 3.8: Metrics and Observability

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

---

## Story 3.9: Error Handling Strategy

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

---

## Story 3.10: Comprehensive Failure Scenario Testing

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
