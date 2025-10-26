# Epic 2: Event Scheduling & Execution

**Epic Goal:** Implement the core event scheduling loop that queries for ready events every minute, claims them atomically to prevent race conditions, queues them for asynchronous execution via SQS, and delivers birthday messages via webhook with exactly-once delivery guarantees. This epic completes the end-to-end birthday messaging capability.

---

## Story 2.1: Event Scheduler - Polling & Query Logic

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

---

## Story 2.2: SQS Queue Integration

**As a** developer,
**I want** an SQS adapter that sends claimed events to a queue,
**so that** scheduling is decoupled from execution for better scalability.

**Acceptance Criteria:**

1. Zod schema defined for SQS message payload (eventId, eventType, idempotencyKey, metadata)
2. TypeScript types derived from schema using `z.infer<typeof SQSMessageSchema>`
3. ISQSClient port interface created using derived types in `src/application/ports/ISQSClient.ts`
4. SQSAdapter implementation created in `src/adapters/secondary/messaging/SQSAdapter.ts`
5. Adapter configured to use LocalStack SQS for local development
6. Adapter validates outgoing messages against schema before sending
7. Adapter sends event details as JSON message to queue with message attributes
8. Adapter handles SQS errors gracefully with logging
9. LocalStack SQS queue created automatically on startup
10. Integration tests verify messages are sent to queue successfully with correct schema

---

## Story 2.3: EventBridge Scheduler Trigger

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

---

## Story 2.4: Webhook Delivery Adapter

**As a** developer,
**I want** a webhook adapter that posts birthday messages to external URLs,
**so that** events can be delivered to third-party services.

**Acceptance Criteria:**

1. Zod schema defined for webhook payload: `{"message": "Hey, {firstName} {lastName} it's your birthday"}`
2. Zod schema defined for webhook response to validate external API responses
3. TypeScript types derived from schemas using `z.infer<>` for type safety
4. IWebhookClient port interface created using derived types in `src/application/ports/IWebhookClient.ts`
5. WebhookAdapter implementation created using Axios 1.6.7 with schema validation
6. Adapter validates outgoing payload against schema before sending
7. Test webhook endpoint configured for development and integration testing:
   - RequestBin (https://requestbin.com) or webhook.site endpoint created
   - Endpoint URL documented in .env.example as WEBHOOK_TEST_URL
   - Endpoint configured to log all requests with headers and body
   - Alternative: Local mock webhook server option documented for offline development
8. Adapter includes idempotency key in request headers (X-Idempotency-Key)
9. External webhook endpoint configured to respect idempotency keys:
   - Webhook service logs show X-Idempotency-Key header in requests
   - Duplicate requests with same idempotency key can be identified in logs
   - Documentation explains how to verify idempotent behavior
10. Adapter implements retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
11. Adapter distinguishes between transient (5xx, timeout) and permanent (4xx) failures
12. Adapter logs all requests and responses with correlation IDs
13. Unit tests verify retry logic, error handling, and schema validation

---

## Story 2.5: Event Executor Use Case

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

---

## Story 2.6: Worker Lambda - SQS Consumer

**As a** developer,
**I want** a worker Lambda that consumes events from SQS queue,
**so that** events are executed asynchronously from scheduling.

**Acceptance Criteria:**

1. Lambda handler created in `src/adapters/primary/lambda/workerHandler.ts`
2. Handler configured to be triggered by SQS messages (batch size: 10)
3. Handler validates incoming SQS messages against SQSMessageSchema from Story 2.2
4. Handler uses derived types from schema for type-safe message processing
5. Handler wraps ExecuteEventUseCase with dependency injection
6. Handler processes each message in batch independently
7. Handler rejects invalid messages with schema validation errors (sent to DLQ)
8. Handler deletes message from queue only after successful execution
9. Handler logs processing results for each message with validation status
10. LocalStack SQS trigger configured and tested
11. Integration tests verify end-to-end flow from queue to execution with schema validation

---

## Story 2.7: Idempotency Key Generation

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

---

## Story 2.8: Event State Machine Enforcement

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

---

## Story 2.9: Next Year Event Generation

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

---

## Story 2.9b: Configurable Event Delivery Times

**As a** developer,
**I want** event delivery times to be configurable instead of hardcoded,
**so that** I can easily test events without waiting until 9:00 AM and support different event types with different delivery times in the future.

**Acceptance Criteria:**

1. Delivery time (hour and minute) is configurable via code constants (not hardcoded in BirthdayEventHandler)
2. BirthdayEventHandler accepts delivery time configuration via constructor (defaults to 9:00 AM)
3. Configuration file defines delivery times for all event types (BIRTHDAY: 9:00 AM)
4. All existing unit tests pass without modification (default behavior unchanged)
5. New unit tests verify custom delivery times work correctly
6. Integration tests can override delivery time for fast test execution

**Implementation:**

- Configuration file: `src/modules/event-scheduling/config/event-delivery-times.ts`
- BirthdayEventHandler constructor accepts `EventDeliveryTimeConfig` parameter
- Default parameter value maintains backward compatibility (9:00 AM)
- Tests can create handler with custom config: `new BirthdayEventHandler({ hour: 15, minute: 30 })`

**Testing Benefit:**

E2E tests (Story 2.10) can now schedule events for "25 seconds from now" instead of hardcoded 9:00 AM, enabling fast, realistic test execution without time mocking or artificial "overdue" events.

---

## Story 2.10: End-to-End Scheduling Flow Test

**As a** developer,
**I want** comprehensive E2E tests for the complete scheduling flow,
**so that** I can verify the entire system works together correctly.

**Acceptance Criteria:**

1. E2E test creates user with birthday and event scheduled for near future (using Story 2.9b configurable delivery times)
2. Test waits in real-time for event to become ready (no time mocking needed)
3. Test verifies scheduler finds and claims event
4. Test verifies event sent to SQS queue
5. Test verifies worker processes message and delivers webhook
6. Test verifies event status updated to COMPLETED
7. Test verifies next year's event was created
8. Test completes in <30 seconds with all assertions passing

**Note:** Story 2.9b (Configurable Event Delivery Times) enables this E2E test to schedule events 20-30 seconds from now instead of hardcoded 9:00 AM. This eliminates the need for time mocking or creating artificial "overdue" events, resulting in cleaner, more realistic test scenarios.

---

## Story 2.11: LocalStack Configuration Simplification

**As a** developer,
**I want** a simplified LocalStack setup with consistent resource creation,
**so that** the local development environment is easier to understand and maintain.

**Acceptance Criteria:**

1. Consolidate queue naming - use single consistent queue name throughout project
2. Remove duplicate queue creation (init script vs tests)
3. Simplify init-aws.sh to only create static infrastructure (EventBridge rules, IAM roles)
4. Let tests create their own test-specific resources (queues, Lambda functions) using AWS SDK
5. Remove deprecated shell scripts (lambda-deploy.sh, lambda-eventbridge.sh)
6. Keep only Node.js deployment script (deploy-lambda.js) using AWS SDK
7. Update documentation to reflect simplified approach
8. Verify all tests still pass with simplified setup
9. Document LocalStack architecture and best practices in architecture docs
10. Add troubleshooting guide for common LocalStack issues

**Note:** This is a cleanup/refactoring story to be completed after all feature stories are done.

**Implementation Discovery:** Upon detailed analysis during story preparation, the LocalStack architecture is already well-designed with proper separation between persistent infrastructure (manual E2E testing/demos) and ephemeral test resources (automated tests). The actual work required is:

- Fix queue name mismatch bug: `bday-events-queue` → `events-queue` in deploy-lambda.js
- Remove deprecated shell scripts (lambda-deploy.sh, lambda-eventbridge.sh)
- Document the existing dual-purpose LocalStack pattern
- Add troubleshooting guide for common LocalStack issues

Most acceptance criteria validate existing correct patterns rather than requiring implementation changes. Estimated effort: ~30 minutes.
