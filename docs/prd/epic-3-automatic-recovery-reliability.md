# Epic 3: Automatic Recovery & Reliability (MVP)

**Epic Goal:** Implement a simple self-healing recovery mechanism that automatically detects and executes missed events after system downtime. When the system restarts, it finds missed events and queues them for execution - no manual intervention required.

**Scope:** MVP focuses on core recovery functionality only. Advanced features (performance optimization, DLQ, metrics) deferred to Epic 4.

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

## Story 3.2: Recovery Execution (Simplified)

**As a** developer,
**I want** missed events automatically queued for execution,
**so that** recovery happens without manual intervention.

**Acceptance Criteria:**

1. RecoveryService sends missed events to SQS queue
2. Each event sent with existing SQS message format (eventId, eventType, idempotencyKey, metadata)
3. Recovery service logs completion: "Recovery complete: X events queued"
4. Unit tests verify missed events are sent to SQS
5. Integration tests verify end-to-end recovery flow (detection → SQS → execution)

---

## Story 3.3: Recovery on System Startup (Simplified)

**As a** developer,
**I want** recovery to run automatically when the system starts,
**so that** no manual intervention is required after downtime.

**Acceptance Criteria:**

1. Application startup hook calls RecoveryService.execute()
2. Startup hook logs: "Recovery check complete" or "No missed events found"
3. Startup hook handles errors gracefully (logs error, allows system to continue)
4. Docker Compose restart triggers recovery automatically
5. Integration test simulates downtime and restart, verifies recovery runs

**Story 3.4 has been moved to Epic 4: End-to-End Testing** (Story 4.6)

---

## Epic 3 Complete! 🎉

All recovery and reliability stories have been implemented:

- ✅ Story 3.1: Recovery Service - Missed Event Detection
- ✅ Story 3.2: Recovery Execution
- ✅ Story 3.3: Recovery on System Startup
- Story 3.4: Moved to Epic 4 (E2E Testing infrastructure required first)
